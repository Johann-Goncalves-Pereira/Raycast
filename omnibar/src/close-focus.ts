/**
 * Explicit closes (Escape, empty Delete, Enter, Cmd+Enter) activate the
 * browser. Unmount is a click or trackpad gesture, and must leave focus alone.
 */
export type CloseReason =
  | "escape"
  | "empty-delete"
  | "submit"
  | "open"
  | "unmount";

export function shouldActivateBrowser(reason: CloseReason): boolean {
  return reason !== "unmount";
}
