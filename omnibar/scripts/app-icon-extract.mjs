/**
 * Zen's checked-in PNG was a document-style render, so it is always replaced.
 * Other browsers keep a PNG that is already on disk unless `--full` is set.
 */
export function shouldExtractIcon(id, destinationExists, full) {
  if (full) return true;
  if (id === "zen") return true;
  return !destinationExists;
}
