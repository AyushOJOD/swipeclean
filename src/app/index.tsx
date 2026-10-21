import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AlbumPicker from "../components/AlbumPicker";
import FinishedScreen from "../components/FinishedScreen";
import MediaCard from "../components/MediaCard";
import SavedSessionPrompt from "../components/SavedSessionPrompt";

import DeletionQueueModal from "@/components/DeletionQueueModal";
import MediaPreviewModal from "@/components/MediaPreviewModal";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import styles from "../styles/styles";
import type { Decision, Direction, GalleryAlbum, Photo } from "../types/media";
import type { HistoryEntry, SavedSession } from "../types/session";

const SESSION_FILE = `${FileSystem.documentDirectory ?? ""}swipeclean-session.json`;

const SWIPE_THRESHOLD = 110;

export default function HomeScreen() {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [queuedPhotos, setQueuedPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<GalleryAlbum | null>(null);
  const [photoCountInput, setPhotoCountInput] = useState("50");
  const [targetCount, setTargetCount] = useState(0);
  const [albumPickerVisible, setAlbumPickerVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [previewedPhoto, setPreviewedPhoto] = useState<Photo | null>(null);
  const [deletingPhotos, setDeletingPhotos] = useState(false);
  const [unavailablePhotoIds, setUnavailablePhotoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [sessionChoiceRequired, setSessionChoiceRequired] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const currentPhoto = photos[index];
  const rejectedPhotos = queuedPhotos;
  const photoInPreview = previewedPhoto ?? currentPhoto;

  const finished =
    !loading &&
    !permissionDenied &&
    !galleryError &&
    photos.length > 0 &&
    index >= photos.length;

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setGalleryError(null);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(false, [
        "photo",
        "video",
      ]);
      if (!permission.granted) {
        setPermissionDenied(true);
        setPhotos([]);
        setAlbums([]);
        return;
      }
      setPermissionDenied(false);
      const albumResults = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });

      // Keep only albums that actually contain photos or videos.
      const checkedAlbums = await Promise.all(
        albumResults
          .filter((album) => album.assetCount > 0)
          .map(async (album): Promise<GalleryAlbum | null> => {
            try {
              const result = await MediaLibrary.getAssetsAsync({
                album: album.id,
                mediaType: [
                  MediaLibrary.MediaType.photo,
                  MediaLibrary.MediaType.video,
                ],
                first: 1,
              });

              if (result.assets.length === 0) {
                return null;
              }

              return {
                id: album.id,
                title: album.title,
                assetCount: album.assetCount,
              };
            } catch (error) {
              console.warn(
                `Couldn't verify media in album "${album.title}":`,
                error,
              );
              return null;
            }
          }),
      );

      const mappedAlbums = checkedAlbums
        .filter((album): album is GalleryAlbum => album !== null)
        .sort((a, b) => a.title.localeCompare(b.title));

      setAlbums(mappedAlbums);
      setPhotos([]);
      setSelectedAlbum(null);
      setTargetCount(0);
      setAlbumPickerVisible(true);
      setSessionReady(false);

      if (FileSystem.documentDirectory) {
        try {
          const info = await FileSystem.getInfoAsync(SESSION_FILE);
          if (info.exists) {
            const parsed = JSON.parse(
              await FileSystem.readAsStringAsync(SESSION_FILE),
            ) as SavedSession;
            if (
              Array.isArray(parsed.photoIds) &&
              parsed.decisions &&
              Array.isArray(parsed.history) &&
              Number.isFinite(parsed.index)
            ) {
              setSavedSession(parsed);
              setSessionChoiceRequired(
                Boolean(
                  parsed.photoIds.length &&
                  (parsed.index > 0 ||
                    Object.keys(parsed.decisions).length > 0 ||
                    (Array.isArray(parsed.queuedPhotoIds) &&
                      parsed.queuedPhotoIds.length > 0)),
                ),
              );
            }
          }
        } catch (storageError) {
          console.warn("Couldn't read saved SwipeClean session:", storageError);
        }
      }
    } catch (error) {
      console.error("Failed to load gallery albums:", error);
      setGalleryError("Couldn't load your gallery folders. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const startAlbumReview = useCallback(
    async (album: GalleryAlbum, requestedCount: number) => {
      const safeCount = Math.min(
        Math.max(1, Math.floor(requestedCount)),
        album.assetCount,
      );
      setLoading(true);
      setGalleryError(null);
      setSelectedAlbum(album);
      setTargetCount(safeCount);
      setSessionReady(false);
      try {
        let cursor: string | undefined;
        let hasNext = true;
        let loaded: Photo[] = [];
        while (hasNext && loaded.length < safeCount) {
          const result = await MediaLibrary.getAssetsAsync({
            album: album.id,
            mediaType: [
              MediaLibrary.MediaType.photo,
              MediaLibrary.MediaType.video,
            ],
            first: Math.min(100, safeCount - loaded.length),
            ...(cursor ? { after: cursor } : {}),
            sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          });
          const mappedItems: Photo[] = await Promise.all(
            result.assets.map(async (asset) => {
              const mediaType: Photo["mediaType"] =
                asset.mediaType === MediaLibrary.MediaType.video
                  ? "video"
                  : "photo";
              let thumbnailUri: string | undefined;
              if (mediaType === "video") {
                try {
                  const thumbnail = await VideoThumbnails.getThumbnailAsync(
                    asset.uri,
                    { time: 1000 },
                  );
                  thumbnailUri = thumbnail.uri;
                } catch (thumbnailError) {
                  console.warn(
                    `Couldn't create a video thumbnail for ${asset.filename}:`,
                    thumbnailError,
                  );
                }
              }
              return {
                id: asset.id,
                uri: asset.uri,
                label:
                  asset.filename ||
                  (mediaType === "video" ? "Your video" : "Your photo"),
                mediaType,
                duration: mediaType === "video" ? asset.duration : undefined,
                thumbnailUri,
              };
            }),
          );
          loaded = [...loaded, ...mappedItems];
          cursor = result.endCursor;
          hasNext = result.hasNextPage;
          if (!result.assets.length) break;
        }
        setPhotos(loaded.slice(0, safeCount));
        setTotalCount(Math.min(safeCount, loaded.length));
        setHasNextPage(false);
        setEndCursor(null);
        setIndex(0);
        setDecisions({});
        setHistory([]);
        setSavedSession(null);
        setSessionChoiceRequired(false);
        setAlbumPickerVisible(false);
        setSessionReady(false);
        return loaded.slice(0, safeCount);
      } catch (error) {
        console.error("Failed to load selected album:", error);
        setGalleryError(
          "Couldn't load items from that folder. Choose another folder or try again.",
        );
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    if (!sessionReady || loading || !FileSystem.documentDirectory) return;

    const session: SavedSession = {
      albumId: selectedAlbum?.id,
      albumTitle: selectedAlbum?.title,
      targetCount,
      photoIds: photos.map((photo) => photo.id),
      index,
      decisions,
      history,
      queuedPhotoIds: queuedPhotos.map((photo) => photo.id),
    };

    void FileSystem.writeAsStringAsync(
      SESSION_FILE,
      JSON.stringify(session),
    ).catch((error) =>
      console.warn("Couldn't save SwipeClean progress:", error),
    );
  }, [
    sessionReady,
    loading,
    photos,
    index,
    decisions,
    history,
    queuedPhotos,
    selectedAlbum,
    targetCount,
  ]);

  const resumeSavedSession = async () => {
    if (!savedSession) return;
    const album =
      albums.find((item) => item.id === savedSession.albumId) ??
      albums.find((item) => item.title === savedSession.albumTitle);
    if (!album) {
      setSessionChoiceRequired(false);
      setSavedSession(null);
      setAlbumPickerVisible(true);
      return;
    }
    const count = Math.min(
      savedSession.targetCount ?? savedSession.photoIds.length,
      album.assetCount,
    );
    const loadedPhotos = await startAlbumReview(album, count);
    if (!loadedPhotos?.length) return;
    const currentIds = new Set(loadedPhotos.map((photo) => photo.id));
    const restoredDecisions: Record<string, Decision> = {};
    Object.entries(savedSession.decisions).forEach(([id, decision]) => {
      if (
        currentIds.has(id) &&
        (decision === "kept" || decision === "rejected")
      )
        restoredDecisions[id] = decision;
    });
    const indexById = new Map(
      loadedPhotos.map((photo, photoIndex) => [photo.id, photoIndex]),
    );
    const restoredHistory = savedSession.history.flatMap((entry) => {
      const photoId = savedSession.photoIds[entry.index];
      const newIndex = photoId ? indexById.get(photoId) : undefined;
      return newIndex === undefined ? [] : [{ ...entry, index: newIndex }];
    });
    const previousPhotoId =
      savedSession.photoIds[Math.max(0, savedSession.index - 1)];
    const restoredIndex =
      previousPhotoId && indexById.has(previousPhotoId)
        ? (indexById.get(previousPhotoId) as number) + 1
        : Math.min(savedSession.index, loadedPhotos.length);
    setDecisions(restoredDecisions);
    setHistory(restoredHistory);
    const queuedIds = new Set(savedSession.queuedPhotoIds ?? []);
    setQueuedPhotos(loadedPhotos.filter((photo) => queuedIds.has(photo.id)));
    setIndex(Math.min(restoredIndex, loadedPhotos.length));
    setSessionChoiceRequired(false);
    setSavedSession(null);
    setSessionReady(true);
  };

  const startFreshSession = () => {
    setIndex(0);
    setDecisions({});
    setHistory([]);
    setPhotos([]);
    setSessionChoiceRequired(false);
    setSavedSession(null);
    setAlbumPickerVisible(true);
    setSessionReady(false);
  };

  const handleSwipe = useCallback(
    (direction: Direction) => {
      const photo = photos[index];
      if (!photo) return;

      const decision: Decision = direction === "right" ? "kept" : "rejected";

      setDecisions((previous) => ({
        ...previous,
        [photo.id]: decision,
      }));

      if (decision === "rejected") {
        // Left swipe: add to the deletion queue, without duplicates.
        setQueuedPhotos((previous) =>
          previous.some((item) => item.id === photo.id)
            ? previous
            : [...previous, photo],
        );
      } else {
        // Right swipe: remove from the deletion queue.
        setQueuedPhotos((previous) =>
          previous.filter((item) => item.id !== photo.id),
        );
      }
      // Remember both the previous review decision and queue membership.
      // Queue membership matters after "Review this selection again", which
      // resets decisions but intentionally keeps pending deletions queued.
      const previousDecision = decisions[photo.id];
      const previousQueued = queuedPhotos.some((item) => item.id === photo.id);

      setHistory((previous) => [
        ...previous,
        { index, decision, previousDecision, previousQueued },
      ]);
      setIndex((previous) => previous + 1);
    },
    [decisions, index, photos, queuedPhotos],
  );

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
  }, [index, translateX, translateY]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationX * 0.06;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(500, { duration: 180 }, () => {
          runOnJS(handleSwipe)("right");
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-500, { duration: 180 }, () => {
          runOnJS(handleSwipe)("left");
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  // A tap opens the current photo; a horizontal pan continues to swipe it.
  const tapToPreview = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_event, success) => {
      if (success) {
        runOnJS(setPreviewedPhoto)(null);
        runOnJS(setPreviewVisible)(true);
      }
    });

  const cardGesture = Gesture.Race(pan, tapToPreview);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${translateX.value * 0.04}deg` },
    ],
  }));

  const keepStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(translateX.value / 100, 0), 1),
  }));

  const rejectStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(-translateX.value / 100, 0), 1),
  }));

  // Mark an asset whose URI no longer loads. The user can then skip it
  // without leaving a black card or corrupting the review indices.
  const handlePhotoUnavailable = useCallback((photoId: string) => {
    setUnavailablePhotoIds((previous) => {
      if (previous.has(photoId)) return previous;
      const next = new Set(previous);
      next.add(photoId);
      return next;
    });
  }, []);

  const skipUnavailablePhoto = useCallback(
    (photoId: string) => {
      const oldPhotos = photos;
      const missingIndex = oldPhotos.findIndex((photo) => photo.id === photoId);
      if (missingIndex < 0) return;

      const remainingPhotos = oldPhotos.filter((photo) => photo.id !== photoId);
      const newIndexById = new Map(
        remainingPhotos.map((photo, newIndex) => [photo.id, newIndex]),
      );

      setPhotos(remainingPhotos);
      setQueuedPhotos((previous) =>
        previous.filter((photo) => photo.id !== photoId),
      );
      setDecisions((previous) => {
        const next = { ...previous };
        delete next[photoId];
        return next;
      });
      setHistory((previous) =>
        previous.flatMap((entry) => {
          const oldPhoto = oldPhotos[entry.index];
          if (!oldPhoto || oldPhoto.id === photoId) return [];
          const newIndex = newIndexById.get(oldPhoto.id);
          return newIndex === undefined ? [] : [{ ...entry, index: newIndex }];
        }),
      );
      setIndex((previous) =>
        previous > missingIndex ? previous - 1 : previous,
      );
      setPreviewVisible(false);
      setPreviewedPhoto(null);
      setUnavailablePhotoIds((previous) => {
        const next = new Set(previous);
        next.delete(photoId);
        return next;
      });
      translateX.value = 0;
      translateY.value = 0;
    },
    [photos, translateX, translateY],
  );

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;

    const photo = photos[last.index];
    if (!photo) return;

    setDecisions((previous) => {
      const next = { ...previous };
      if (last.previousDecision) {
        next[photo.id] = last.previousDecision;
      } else {
        delete next[photo.id];
      }
      return next;
    });

    // Restore exactly the queue membership from before the undone swipe.
    // The fallback keeps older saved history entries compatible.
    const shouldBeQueued =
      last.previousQueued ?? last.previousDecision === "rejected";
    setQueuedPhotos((previous) => {
      const withoutCurrent = previous.filter((item) => item.id !== photo.id);
      return shouldBeQueued ? [...withoutCurrent, photo] : withoutCurrent;
    });

    setHistory((previous) => previous.slice(0, -1));
    setIndex(last.index);
  };

  const resetSession = () => {
    setIndex(0);
    setDecisions({});
    setHistory([]);
  };

  const keptCount = Object.values(decisions).filter(
    (decision) => decision === "kept",
  ).length;

  const rejectedCount = Object.values(decisions).filter(
    (decision) => decision === "rejected",
  ).length;

  const progress =
    totalCount > 0
      ? (Math.min(index, totalCount) / totalCount) * 100
      : photos.length > 0
        ? (Math.min(index, photos.length) / photos.length) * 100
        : 0;

  const showSwipeControls =
    !albumPickerVisible &&
    !loading &&
    !permissionDenied &&
    !galleryError &&
    photos.length > 0 &&
    !finished;

  const animateSwipe = (direction: Direction) => {
    translateX.value = withTiming(
      direction === "right" ? 500 : -500,
      { duration: 180 },
      () => {
        runOnJS(handleSwipe)(direction);
      },
    );
  };

  const confirmDeleteQueue = () => {
    if (rejectedPhotos.length === 0 || deletingPhotos) return;

    Alert.alert(
      "Delete media permanently?",
      `This will ask Android to delete ${rejectedPhotos.length} selected ${
        rejectedPhotos.length === 1 ? "item" : "items"
      } from your device. This action cannot be undone in SwipeClean.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingPhotos(true);
              const deletingIds = new Set(
                rejectedPhotos.map((photo) => photo.id),
              );
              const currentPhotoId = currentPhoto?.id;
              const oldPhotos = photos;

              try {
                const success = await MediaLibrary.deleteAssetsAsync(
                  rejectedPhotos.map((photo) => photo.id),
                );

                if (!success) {
                  Alert.alert(
                    "Deletion not completed",
                    "Android did not confirm the deletion. Your queue has been kept unchanged.",
                  );
                  return;
                }

                const remainingPhotos = oldPhotos.filter(
                  (photo) => !deletingIds.has(photo.id),
                );
                const newIndexById = new Map(
                  remainingPhotos.map((photo, newIndex) => [
                    photo.id,
                    newIndex,
                  ]),
                );

                setPhotos(remainingPhotos);
                setQueuedPhotos((previous) =>
                  previous.filter((photo) => !deletingIds.has(photo.id)),
                );
                setDecisions((previous) => {
                  const next = { ...previous };
                  deletingIds.forEach((id) => delete next[id]);
                  return next;
                });
                setHistory((previous) =>
                  previous.flatMap((entry) => {
                    const oldPhoto = oldPhotos[entry.index];
                    if (!oldPhoto || deletingIds.has(oldPhoto.id)) return [];
                    const newIndex = newIndexById.get(oldPhoto.id);
                    return newIndex === undefined
                      ? []
                      : [{ ...entry, index: newIndex }];
                  }),
                );

                const nextCurrentIndex = currentPhotoId
                  ? newIndexById.get(currentPhotoId)
                  : undefined;
                setIndex(
                  nextCurrentIndex ??
                    Math.min(index, Math.max(remainingPhotos.length - 1, 0)),
                );
                setPreviewVisible(false);
                setPreviewedPhoto(null);
                Alert.alert(
                  "Deletion complete",
                  `${rejectedPhotos.length} ${
                    rejectedPhotos.length === 1 ? "item was" : "items were"
                  } deleted.`,
                );
              } catch (error) {
                console.error("Failed to delete queued photos:", error);
                Alert.alert(
                  "Couldn't delete items",
                  "Android may require you to approve the deletion. No queue items have been removed from SwipeClean.",
                );
              } finally {
                setDeletingPhotos(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>SwipeClean</Text>
          <Text style={styles.subtitle}>A little less clutter.</Text>
        </View>

        <View style={styles.headerActions}>
          {!albumPickerVisible && photos.length > 0 && !finished && (
            <TouchableOpacity
              accessibilityLabel="Choose another folder"
              style={styles.queueButton}
              onPress={() => {
                setAlbumPickerVisible(true);
                setPhotos([]);
                setIndex(0);
                setDecisions({});
                setHistory([]);
                setSessionReady(false);
              }}
            >
              <Text style={styles.queueButtonText}>← Folders</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityLabel="Open deletion queue"
            style={styles.queueButton}
            onPress={() => setQueueVisible(true)}
          >
            <Text style={styles.queueButtonText}>
              Queue {rejectedPhotos.length}
            </Text>
          </TouchableOpacity>
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {photos.length === 0
                ? 0
                : Math.min(
                    index + (currentPhoto ? 1 : 0),
                    totalCount || photos.length,
                  )}
              {" / "}
              {totalCount || photos.length}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <View style={styles.cardArea}>
        {loading ? (
          <View style={styles.loadingState}>
            <View style={styles.loadingMark}>
              <ActivityIndicator size="large" color="#B8A5FF" />
            </View>
            <Text style={styles.loadingTitle}>Getting things ready</Text>
            <Text style={styles.loadingSubtitle}>
              Finding your media and albums…
            </Text>
            <View style={styles.loadingTrack}>
              <View style={styles.loadingTrackFill} />
            </View>
          </View>
        ) : permissionDenied ? (
          <View style={styles.finishedCard}>
            <Text style={styles.finishedTitle}>Media access needed</Text>
            <Text style={styles.finishedSubtitle}>
              Allow access to your media to start reviewing your gallery.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadGallery()}
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : galleryError ? (
          <TouchableOpacity
            style={styles.finishedCard}
            onPress={() => void loadGallery()}
          >
            <Text style={styles.finishedTitle}>Couldn't load media</Text>
            <Text style={styles.finishedSubtitle}>{galleryError}</Text>
            <Text style={styles.primaryButtonText}>Tap to retry</Text>
          </TouchableOpacity>
        ) : albumPickerVisible && !(sessionChoiceRequired && savedSession) ? (
          <AlbumPicker
            albums={albums}
            selectedAlbum={selectedAlbum}
            photoCountInput={photoCountInput}
            onSelectAlbum={(album) => {
              if (selectedAlbum?.id === album.id) {
                setSelectedAlbum(null);
              } else {
                setSelectedAlbum(album);
                setPhotoCountInput(String(Math.min(50, album.assetCount)));
              }
            }}
            onChangePhotoCount={setPhotoCountInput}
            onStartReview={(album, count) => {
              void startAlbumReview(album, count).then(() =>
                setSessionReady(true),
              );
            }}
          />
        ) : sessionChoiceRequired && savedSession ? (
          <SavedSessionPrompt
            reviewedCount={savedSession.index}
            queuedCount={
              Object.values(savedSession.decisions).filter(
                (decision) => decision === "rejected",
              ).length
            }
            onResume={() => void resumeSavedSession()}
            onStartFresh={startFreshSession}
          />
        ) : photos.length === 0 ? (
          <View style={styles.finishedCard}>
            <Text style={styles.finishedEmoji}>📷</Text>
            <Text style={styles.finishedTitle}>No media found</Text>
            <Text style={styles.finishedSubtitle}>
              Add media to your device or check your gallery permissions.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadGallery()}
            >
              <Text style={styles.primaryButtonText}>Reload gallery</Text>
            </TouchableOpacity>
          </View>
        ) : finished ? (
          <FinishedScreen
            selectedCount={photos.length}
            albumTitle={selectedAlbum?.title ?? "this folder"}
            reviewedCount={keptCount + rejectedCount}
            keptCount={keptCount}
            rejectedCount={rejectedPhotos.length}
            deletingPhotos={deletingPhotos}
            onChooseAnotherFolder={() => {
              setAlbumPickerVisible(true);
              setPhotos([]);
              setIndex(0);
              setDecisions({});
              setHistory([]);
              setSessionReady(false);
            }}
            onDeleteSelected={confirmDeleteQueue}
            onReviewAgain={resetSession}
          />
        ) : currentPhoto ? (
          <GestureDetector gesture={cardGesture}>
            <MediaCard
              photo={currentPhoto}
              unavailable={unavailablePhotoIds.has(currentPhoto.id)}
              cardStyle={cardStyle}
              keepStyle={keepStyle}
              rejectStyle={rejectStyle}
              onPhotoUnavailable={handlePhotoUnavailable}
              onSkipUnavailable={skipUnavailablePhoto}
            />
          </GestureDetector>
        ) : null}
      </View>

      {showSwipeControls && (
        <>
          <Text style={styles.hint}>Swipe right to keep · Left to reject</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityLabel="Reject item"
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => animateSwipe("left")}
            >
              <Text style={styles.rejectIcon}>×</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Undo last swipe"
              style={[styles.actionButton, styles.undoButton]}
              onPress={undo}
              disabled={history.length === 0}
            >
              <Text
                style={[
                  styles.undoIcon,
                  history.length === 0 && styles.disabledIcon,
                ]}
              >
                ↶
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Keep item"
              style={[styles.actionButton, styles.keepButton]}
              onPress={() => animateSwipe("right")}
            >
              <Text style={styles.keepIcon}>♥</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <DeletionQueueModal
        visible={queueVisible}
        rejectedPhotos={rejectedPhotos}
        photos={photos}
        deletingPhotos={deletingPhotos}
        onClose={() => setQueueVisible(false)}
        onPreview={(photo) => {
          setPreviewedPhoto(photo);
          setPreviewVisible(true);
        }}
        onRestore={(photo) => {
          setQueuedPhotos((previous) =>
            previous.filter((item) => item.id !== photo.id),
          );

          setDecisions((previous) => {
            const next = { ...previous };
            delete next[photo.id];
            return next;
          });

          setHistory((previous) =>
            previous.filter((entry) => photos[entry.index]?.id !== photo.id),
          );
        }}
        onDeleteQueue={confirmDeleteQueue}
      />

      <MediaPreviewModal
        visible={previewVisible}
        photo={photoInPreview}
        onClose={() => {
          setPreviewVisible(false);
          setPreviewedPhoto(null);
        }}
        onPhotoUnavailable={handlePhotoUnavailable}
      />
    </SafeAreaView>
  );
}
