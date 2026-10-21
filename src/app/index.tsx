import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type Decision = "kept" | "rejected";
type Direction = "left" | "right";

type Photo = {
  id: string;
  uri: string;
  label: string;
  mediaType: "photo" | "video";
  duration?: number;
  thumbnailUri?: string;
};

type HistoryEntry = {
  index: number;
  decision: Decision;
  previousDecision?: Decision;
  previousQueued?: boolean;
};

type GalleryAlbum = { id: string; title: string; assetCount: number };

type SavedSession = {
  albumId?: string;
  albumTitle?: string;
  targetCount?: number;
  photoIds: string[];
  index: number;
  decisions: Record<string, Decision>;
  history: HistoryEntry[];
  // Persist queued media IDs separately from swipe decisions so pending deletions survive restarts.
  queuedPhotoIds?: string[];
};

const SESSION_FILE = `${FileSystem.documentDirectory ?? ""}swipeclean-session.json`;

const SWIPE_THRESHOLD = 110;

function formatDuration(seconds?: number) {
  if (!Number.isFinite(seconds) || seconds === undefined || seconds < 0)
    return "Video";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.previewVideo}
      nativeControls
      contentFit="contain"
    />
  );
}

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
          <ScrollView contentContainerStyle={styles.pickerContainer}>
            <Text style={styles.finishedEmoji}>🗂️</Text>
            <Text style={styles.pickerEyebrow}>YOUR GALLERY</Text>
            <Text style={styles.finishedTitle}>Choose a folder</Text>
            <Text style={styles.finishedSubtitle}>
              Pick an album, then choose how many items to review. You can
              select up to the number available in that album.
            </Text>
            {albums.map((album) => {
              const isExpanded = selectedAlbum?.id === album.id;
              return (
                <View key={album.id} style={styles.albumAccordion}>
                  <TouchableOpacity
                    style={[
                      styles.albumOption,
                      isExpanded && styles.albumOptionSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                    onPress={() => {
                      if (isExpanded) {
                        setSelectedAlbum(null);
                      } else {
                        setSelectedAlbum(album);
                        setPhotoCountInput(
                          String(Math.min(50, album.assetCount)),
                        );
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.albumTitle}>{album.title}</Text>
                      <Text style={styles.albumCount}>
                        {album.assetCount} items
                      </Text>
                    </View>
                    <Text style={styles.albumSelectMark}>
                      {isExpanded ? "⌃" : "⌄"}
                    </Text>
                  </TouchableOpacity>
                  {isExpanded ? (
                    <View style={styles.countPanel}>
                      <Text style={styles.albumTitle}>How many items?</Text>
                      <Text style={styles.albumCount}>
                        Available in {album.title}: {album.assetCount}
                      </Text>
                      <View style={styles.countChips}>
                        {[25, 50, 100]
                          .filter((n) => n <= album.assetCount)
                          .map((n) => (
                            <TouchableOpacity
                              key={n}
                              style={[
                                styles.countChip,
                                Number(photoCountInput) === n &&
                                  styles.countChipSelected,
                              ]}
                              onPress={() => setPhotoCountInput(String(n))}
                            >
                              <Text style={styles.countChipText}>{n}</Text>
                            </TouchableOpacity>
                          ))}
                        <TouchableOpacity
                          style={[
                            styles.countChip,
                            Number(photoCountInput) === album.assetCount &&
                              styles.countChipSelected,
                          ]}
                          onPress={() =>
                            setPhotoCountInput(String(album.assetCount))
                          }
                        >
                          <Text style={styles.countChipText}>
                            All ({album.assetCount})
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        value={photoCountInput}
                        onChangeText={(value) =>
                          setPhotoCountInput(value.replace(/[^0-9]/g, ""))
                        }
                        keyboardType="number-pad"
                        placeholder="Enter number"
                        placeholderTextColor="#8D93A2"
                        style={styles.countInput}
                      />
                      <Text style={styles.albumCount}>
                        Choose 1–{album.assetCount} items.
                      </Text>
                      <TouchableOpacity
                        style={styles.primaryButton}
                        disabled={
                          !photoCountInput ||
                          Number(photoCountInput) < 1 ||
                          Number(photoCountInput) > album.assetCount
                        }
                        onPress={() =>
                          void startAlbumReview(
                            album,
                            Number(photoCountInput),
                          ).then(() => setSessionReady(true))
                        }
                      >
                        <Text style={styles.primaryButtonText}>
                          Start reviewing
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        ) : sessionChoiceRequired && savedSession ? (
          <View style={styles.finishedCard}>
            <Text style={styles.finishedEmoji}>👋</Text>
            <Text style={styles.finishedTitle}>Welcome back</Text>
            <Text style={styles.finishedSubtitle}>
              You have a saved review session. Continue where you left off, or
              start a fresh review.
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{savedSession.index}</Text>
                <Text style={styles.statLabel}>Reviewed</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>
                  {
                    Object.values(savedSession.decisions).filter(
                      (decision) => decision === "rejected",
                    ).length
                  }
                </Text>
                <Text style={styles.statLabel}>In queue</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={resumeSavedSession}
            >
              <Text style={styles.primaryButtonText}>Resume review</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={startFreshSession}
            >
              <Text style={styles.secondaryButtonText}>Start fresh</Text>
            </TouchableOpacity>
          </View>
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
          <View style={styles.finishedCard}>
            <Text style={styles.finishedEmoji}>✨</Text>
            <Text style={styles.finishedTitle}>Nice work!</Text>
            <Text style={styles.finishedSubtitle}>
              You've reviewed all {photos.length} selected items from{" "}
              {selectedAlbum?.title ?? "this folder"}.
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>
                  {keptCount + rejectedCount}
                </Text>
                <Text style={styles.statLabel}>Reviewed</Text>
              </View>

              <View style={styles.stat}>
                <Text style={styles.statNumber}>{keptCount}</Text>
                <Text style={styles.statLabel}>Kept</Text>
              </View>

              <View style={styles.stat}>
                <Text style={styles.statNumber}>{rejectedCount}</Text>
                <Text style={styles.statLabel}>Marked for deletion</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setAlbumPickerVisible(true);
                setPhotos([]);
                setIndex(0);
                setDecisions({});
                setHistory([]);
                setSessionReady(false);
              }}
            >
              <Text style={styles.primaryButtonText}>
                Choose another folder
              </Text>
            </TouchableOpacity>

            {/* Delete items marked during this review */}
            {rejectedPhotos.length > 0 && (
              <TouchableOpacity
                style={styles.queueButton}
                onPress={confirmDeleteQueue}
                disabled={deletingPhotos}
              >
                <Text style={styles.queueButtonText}>
                  {deletingPhotos
                    ? "Deleting..."
                    : `Delete selected items (${rejectedPhotos.length})`}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={resetSession}
            >
              <Text style={styles.secondaryButtonText}>
                Review this selection again
              </Text>
            </TouchableOpacity>
          </View>
        ) : currentPhoto ? (
          <GestureDetector gesture={cardGesture}>
            <Animated.View style={[styles.card, cardStyle]}>
              {unavailablePhotoIds.has(currentPhoto.id) ? (
                <View style={styles.unavailableOverlay}>
                  <Text style={styles.unavailableTitle}>Photo unavailable</Text>
                  <Text style={styles.unavailableMessage}>
                    This item may have been deleted or moved outside SwipeClean.
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.unavailableSkipButton}
                    onPress={() => skipUnavailablePhoto(currentPhoto.id)}
                  >
                    <Text style={styles.unavailableSkipButtonText}>
                      Skip unavailable item
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Image
                  key={currentPhoto.id}
                  source={{
                    uri:
                      currentPhoto.mediaType === "video"
                        ? (currentPhoto.thumbnailUri ?? currentPhoto.uri)
                        : currentPhoto.uri,
                  }}
                  style={styles.photo}
                  resizeMode="cover"
                  onError={() => handlePhotoUnavailable(currentPhoto.id)}
                />
              )}
              {!unavailablePhotoIds.has(currentPhoto.id) &&
              currentPhoto.mediaType === "video" ? (
                <View pointerEvents="none" style={styles.videoCenterBadge}>
                  <Text style={styles.videoPlayIcon}>▶</Text>
                  <Text style={styles.videoDuration}>
                    {formatDuration(currentPhoto.duration)}
                  </Text>
                </View>
              ) : null}

              <Animated.View
                style={[styles.stamp, styles.keepStamp, keepStyle]}
              >
                <Text style={styles.keepStampText}>KEEP</Text>
              </Animated.View>

              <Animated.View
                style={[styles.stamp, styles.rejectStamp, rejectStyle]}
              >
                <Text style={styles.rejectStampText}>REJECT</Text>
              </Animated.View>

              <View style={styles.photoInfo}>
                <Text style={styles.photoTitle} numberOfLines={2}>
                  {currentPhoto.label}
                </Text>
                {currentPhoto.mediaType === "video" ? (
                  <View style={styles.videoBadge}>
                    <Text style={styles.videoBadgeText}>
                      ▶ {formatDuration(currentPhoto.duration)}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.photoSubtitle}>
                  SwipeClean ·{" "}
                  {currentPhoto.mediaType === "video" ? "Video" : "Photo"} · Tap
                  to preview
                </Text>
              </View>
            </Animated.View>
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

      <Modal
        visible={queueVisible}
        animationType="slide"
        onRequestClose={() => setQueueVisible(false)}
      >
        <SafeAreaView style={styles.queueScreen}>
          <View style={styles.queueHeader}>
            <View style={styles.previewHeaderText}>
              <Text style={styles.queueTitle}>Deletion queue</Text>
              <Text style={styles.previewSubtitle}>
                {rejectedPhotos.length}{" "}
                {rejectedPhotos.length === 1 ? "item" : "items"} pending review
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close deletion queue"
              onPress={() => setQueueVisible(false)}
              style={styles.previewCloseButton}
            >
              <Text style={styles.previewCloseText}>×</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.queueDescription}>
            These items have not been deleted. Preview them and restore anything
            you want to keep.
          </Text>

          {rejectedPhotos.length === 0 ? (
            <View style={styles.queueEmpty}>
              <Text style={styles.finishedEmoji}>🧹</Text>
              <Text style={styles.finishedTitle}>Your queue is empty</Text>
              <Text style={styles.finishedSubtitle}>
                Swipe left on an item to add it here for review.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.queueGrid}>
              {rejectedPhotos.map((photo) => (
                <View key={photo.id} style={styles.queueItem}>
                  <TouchableOpacity
                    accessibilityLabel={`Preview ${photo.label}`}
                    style={styles.queueThumbnailButton}
                    onPress={() => {
                      setPreviewedPhoto(photo);
                      setPreviewVisible(true);
                    }}
                  >
                    <Image
                      source={{
                        uri:
                          photo.mediaType === "video"
                            ? (photo.thumbnailUri ?? photo.uri)
                            : photo.uri,
                      }}
                      style={styles.queueThumbnail}
                      resizeMode="cover"
                    />
                    {photo.mediaType === "video" ? (
                      <View style={styles.queueVideoBadge}>
                        <Text style={styles.queueVideoBadgeText}>
                          ▶ {formatDuration(photo.duration)}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  <Text style={styles.queuePhotoLabel} numberOfLines={1}>
                    {photo.label}
                  </Text>
                  <TouchableOpacity
                    style={styles.restoreButton}
                    onPress={() => {
                      setQueuedPhotos((previous) =>
                        previous.filter((item) => item.id !== photo.id),
                      );
                      setDecisions((previous) => {
                        const next = { ...previous };
                        delete next[photo.id];
                        return next;
                      });
                      setHistory((previous) =>
                        previous.filter(
                          (entry) => photos[entry.index]?.id !== photo.id,
                        ),
                      );
                    }}
                  >
                    <Text style={styles.restoreButtonText}>Restore</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.queueFooter}>
            <TouchableOpacity
              style={[
                styles.queueDeleteButton,
                (rejectedPhotos.length === 0 || deletingPhotos) &&
                  styles.queueDeleteButtonDisabled,
              ]}
              onPress={confirmDeleteQueue}
              disabled={rejectedPhotos.length === 0 || deletingPhotos}
            >
              <Text style={styles.queueDeleteButtonText}>
                {deletingPhotos
                  ? "Deleting..."
                  : `Delete ${rejectedPhotos.length}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.queueDoneButton}
              onPress={() => setQueueVisible(false)}
              disabled={deletingPhotos}
            >
              <Text style={styles.primaryButtonText}>Done reviewing</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={previewVisible && Boolean(photoInPreview)}
        animationType="fade"
        onRequestClose={() => {
          setPreviewVisible(false);
          setPreviewedPhoto(null);
        }}
        statusBarTranslucent
      >
        <View style={styles.previewScreen}>
          <View style={styles.previewHeader}>
            <View style={styles.previewHeaderText}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {photoInPreview?.label ?? "Media preview"}
              </Text>
              <Text style={styles.previewSubtitle}>
                {photoInPreview?.mediaType === "video"
                  ? "Video preview"
                  : "Photo preview"}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close photo preview"
              onPress={() => {
                setPreviewVisible(false);
                setPreviewedPhoto(null);
              }}
              style={styles.previewCloseButton}
            >
              <Text style={styles.previewCloseText}>×</Text>
            </TouchableOpacity>
          </View>

          {photoInPreview ? (
            photoInPreview.mediaType === "video" ? (
              <VideoPreview key={photoInPreview.id} uri={photoInPreview.uri} />
            ) : (
              <Image
                source={{ uri: photoInPreview.uri }}
                style={styles.previewImage}
                resizeMode="contain"
                onError={() => {
                  handlePhotoUnavailable(photoInPreview.id);
                  setPreviewVisible(false);
                  setPreviewedPhoto(null);
                }}
              />
            )
          ) : null}

          <Text style={styles.previewHint}>
            Close preview to continue reviewing
          </Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#09090F",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  previewVideo: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  subtitle: {
    color: "#9B9AAF",
    fontSize: 13,
    marginTop: 5,
    letterSpacing: 0.15,
  },
  counter: {
    backgroundColor: "#211B32",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#40345D",
  },
  counterText: {
    color: "#F5F6FA",
    fontSize: 13,
    fontWeight: "700",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#282435",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#A78BFA",
    borderRadius: 4,
  },
  pickerContainer: { paddingTop: 16, paddingBottom: 32, gap: 12 },
  pickerEyebrow: {
    color: "#B7A4FF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.2,
    marginBottom: 4,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    paddingHorizontal: 24,
    minHeight: 300,
  },
  loadingMark: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#191622",
    borderWidth: 1,
    borderColor: "#302842",
    marginBottom: 22,
  },
  loadingTitle: {
    color: "#F7F7FB",
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  loadingSubtitle: {
    color: "#8F93A3",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  loadingTrack: {
    width: 136,
    height: 3,
    borderRadius: 3,
    backgroundColor: "#25232F",
    overflow: "hidden",
    marginTop: 24,
  },
  loadingTrackFill: {
    width: "42%",
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#A78BFA",
  },
  albumAccordion: { gap: 0 },
  albumOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#15141E",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#302B40",
  },
  albumOptionSelected: { borderColor: "#A78BFA", backgroundColor: "#211A31" },
  albumTitle: { color: "#F8F7FF", fontSize: 15, fontWeight: "800" },
  albumCount: { color: "#AAA6BC", fontSize: 12, marginTop: 5 },
  albumSelectMark: { color: "#C4B5FD", fontSize: 24, marginLeft: 12 },
  countPanel: {
    backgroundColor: "#15111F",
    borderRadius: 18,
    padding: 18,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#4A3A68",
    gap: 12,
  },
  countChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  countChip: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#49405F",
    backgroundColor: "#211D2D",
  },
  countChipSelected: { borderColor: "#B7A4FF", backgroundColor: "#382A54" },
  countChipText: { color: "#F5F6FA", fontWeight: "700" },
  countInput: {
    backgroundColor: "#100E17",
    color: "#F5F3FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#51436D",
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  cardArea: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 18,
  },
  card: {
    width: "100%",
    height: "100%",
    maxHeight: 560,
    minHeight: 300,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#17181F",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#393247",
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#17171F",
    borderRadius: 24,
  },
  unavailableTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  unavailableMessage: {
    color: "#B8B6C8",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 20,
  },
  unavailableSkipButton: {
    backgroundColor: "#A78BFA",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: "center",
  },
  unavailableSkipButtonText: {
    color: "#171321",
    fontSize: 14,
    fontWeight: "800",
  },
  photo: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  stamp: {
    position: "absolute",
    top: 34,
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  keepStamp: {
    right: 22,
    borderColor: "#4ADE80",
    transform: [{ rotate: "12deg" }],
  },
  keepStampText: {
    color: "#4ADE80",
    fontWeight: "900",
    fontSize: 28,
  },
  rejectStamp: {
    left: 22,
    borderColor: "#FB7185",
    transform: [{ rotate: "-12deg" }],
  },
  rejectStampText: {
    color: "#FB7185",
    fontWeight: "900",
    fontSize: 25,
  },
  videoCenterBadge: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
    minWidth: 78,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: "rgba(9,9,15,0.72)",
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.7)",
  },
  videoPlayIcon: { color: "#FFFFFF", fontSize: 25, fontWeight: "800" },
  videoDuration: {
    color: "#E9E4FF",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  videoBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(9,9,15,0.78)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 6,
  },
  videoBadgeText: { color: "#E9E4FF", fontSize: 11, fontWeight: "800" },
  photoInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingTop: 60,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  photoTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  photoSubtitle: {
    color: "#E0E0E0",
    fontSize: 13,
    marginTop: 7,
  },
  hint: {
    textAlign: "center",
    color: "#8D93A2",
    fontSize: 13,
    marginBottom: 18,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingBottom: 22,
  },
  actionButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B1925",
    borderWidth: 1,
    borderColor: "#40384F",
  },
  rejectButton: {
    borderColor: "#874253",
    backgroundColor: "#301A25",
  },
  keepButton: {
    borderColor: "#367B59",
    backgroundColor: "#172C24",
  },
  undoButton: {
    width: 48,
    height: 48,
  },
  rejectIcon: {
    color: "#FB7185",
    fontSize: 42,
    fontWeight: "300",
    lineHeight: 46,
  },
  keepIcon: {
    color: "#4ADE80",
    fontSize: 28,
  },
  undoIcon: {
    color: "#C4B5FD",
    fontSize: 30,
  },
  disabledIcon: {
    opacity: 0.3,
  },
  finishedCard: {
    backgroundColor: "#14121D",
    borderRadius: 26,
    padding: 26,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 330,
    borderWidth: 1,
    borderColor: "#302A40",
  },
  finishedEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  finishedTitle: {
    color: "#F5F6FA",
    fontSize: 28,
    fontWeight: "800",
  },
  finishedSubtitle: {
    color: "#A1A6B4",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
  },
  statsRow: {
    flexDirection: "row",
    gap: 45,
    marginVertical: 28,
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    color: "#F5F6FA",
    fontSize: 28,
    fontWeight: "800",
  },
  statLabel: {
    color: "#A1A6B4",
    marginTop: 5,
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#454552",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#E7E7EF",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#B7A4FF",
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 25,
  },
  primaryButtonText: {
    color: "#171020",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  queueButton: {
    backgroundColor: "#241D36",
    borderColor: "#65518C",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  queueButtonText: {
    color: "#D8CCFF",
    fontSize: 12,
    fontWeight: "800",
  },
  queueScreen: {
    flex: 1,
    backgroundColor: "#09090F",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
  },
  queueHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  queueTitle: {
    color: "#F5F6FA",
    fontSize: 25,
    fontWeight: "800",
  },
  queueDescription: {
    color: "#A1A6B4",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  queueGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 18,
  },
  queueItem: {
    width: "48%",
    marginBottom: 18,
    backgroundColor: "#171A22",
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: "#303440",
  },
  queueThumbnailButton: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#20232C",
  },
  queueThumbnail: {
    width: "100%",
    height: "100%",
  },
  queueVideoBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    backgroundColor: "rgba(9,9,15,0.82)",
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  queueVideoBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  queuePhotoLabel: {
    color: "#F5F6FA",
    fontSize: 12,
    marginTop: 8,
  },
  restoreButton: {
    marginTop: 8,
    backgroundColor: "#192D25",
    borderColor: "#285541",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  restoreButtonText: {
    color: "#4ADE80",
    fontSize: 13,
    fontWeight: "800",
  },
  queueEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  queueFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  queueDeleteButton: {
    flex: 1,
    backgroundColor: "#3A2028",
    borderColor: "#743646",
    borderWidth: 1,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  queueDeleteButtonDisabled: {
    opacity: 0.45,
  },
  queueDeleteButtonText: {
    color: "#FDA4AF",
    fontSize: 14,
    fontWeight: "800",
  },
  queueDoneButton: {
    flex: 1,
    backgroundColor: "#A78BFA",
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  previewScreen: {
    flex: 1,
    backgroundColor: "#0D0F14",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  previewHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  previewTitle: {
    color: "#F5F6FA",
    fontSize: 17,
    fontWeight: "700",
  },
  previewSubtitle: {
    color: "#8D93A2",
    fontSize: 12,
    marginTop: 4,
  },
  previewCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#20232C",
    alignItems: "center",
    justifyContent: "center",
  },
  previewCloseText: {
    color: "#F5F6FA",
    fontSize: 32,
    lineHeight: 35,
    fontWeight: "300",
  },
  previewImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  previewHint: {
    color: "#8D93A2",
    textAlign: "center",
    fontSize: 12,
    marginTop: 12,
  },
});
