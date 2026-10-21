export function formatDuration(seconds?: number): string {
  if (!Number.isFinite(seconds) || seconds === undefined || seconds < 0) {
    return "Video";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
