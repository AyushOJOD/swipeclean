import * as FileSystem from "expo-file-system/legacy";
import { useEffect } from "react";

import type { Photo } from "../types/media";
import type { HistoryEntry, SavedSession } from "../types/session";

const SESSION_FILE = `${FileSystem.documentDirectory ?? ""}swipeclean-session.json`;

type UseSavedSessionOptions = {
  sessionReady: boolean;
  loading: boolean;
  photos: Photo[];
  index: number;
  decisions: SavedSession["decisions"];
  history: HistoryEntry[];
  queuedPhotos: Photo[];
  selectedAlbumId?: string;
  selectedAlbumTitle?: string;
  targetCount: number;
};

export default function useSavedSession({
  sessionReady,
  loading,
  photos,
  index,
  decisions,
  history,
  queuedPhotos,
  selectedAlbumId,
  selectedAlbumTitle,
  targetCount,
}: UseSavedSessionOptions) {
  useEffect(() => {
    if (!sessionReady || loading || !FileSystem.documentDirectory) return;

    const session: SavedSession = {
      albumId: selectedAlbumId,
      albumTitle: selectedAlbumTitle,
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
    selectedAlbumId,
    selectedAlbumTitle,
    targetCount,
  ]);
}
