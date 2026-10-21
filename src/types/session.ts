import type { Decision } from "./media";

export type HistoryEntry = {
  index: number;
  decision: Decision;
  previousDecision?: Decision;
  previousQueued?: boolean;
};

export type SavedSession = {
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
