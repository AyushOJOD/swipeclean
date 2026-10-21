import type { Dispatch, SetStateAction } from "react";

import type { Decision, GalleryAlbum, Photo } from "../types/media";
import type { HistoryEntry, SavedSession } from "../types/session";

type UseResumeSavedSessionOptions = {
  savedSession: SavedSession | null;
  albums: GalleryAlbum[];
  startAlbumReview: (
    album: GalleryAlbum,
    requestedCount: number,
  ) => Promise<Photo[]>;
  setDecisions: Dispatch<SetStateAction<Record<string, Decision>>>;
  setHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
  setQueuedPhotos: Dispatch<SetStateAction<Photo[]>>;
  setIndex: Dispatch<SetStateAction<number>>;
  setSessionChoiceRequired: Dispatch<SetStateAction<boolean>>;
  setSavedSession: Dispatch<SetStateAction<SavedSession | null>>;
  setAlbumPickerVisible: Dispatch<SetStateAction<boolean>>;
  setSessionReady: Dispatch<SetStateAction<boolean>>;
};

export default function useResumeSavedSession({
  savedSession,
  albums,
  startAlbumReview,
  setDecisions,
  setHistory,
  setQueuedPhotos,
  setIndex,
  setSessionChoiceRequired,
  setSavedSession,
  setAlbumPickerVisible,
  setSessionReady,
}: UseResumeSavedSessionOptions) {
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
      ) {
        restoredDecisions[id] = decision;
      }
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

  return { resumeSavedSession };
}
