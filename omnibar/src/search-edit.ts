/** A late context load must not wipe a query or bang the user already entered. */
export function shouldRestoreSession(input: {
  alreadyRestored: boolean;
  userEdited: boolean;
}): boolean {
  return !input.alreadyRestored && !input.userEdited;
}

export type SearchEdit =
  | "ignore-clear"
  | "keep-scope"
  | "exit-scope"
  | "apply";

/**
 * Clearing the query to enter a bang scope also notifies the search bar.
 * That notification must not be treated as the user backing out of the scope.
 * A later empty change, once the scoped query is already empty, leaves the scope.
 */
export function nextSearchEdit(input: {
  scoped: boolean;
  searchText: string;
  next: string;
  ignoringEmpty: boolean;
}): SearchEdit {
  if (input.ignoringEmpty && input.next.length === 0) return "ignore-clear";
  if (input.scoped && input.searchText.length > 0 && input.next.length === 0) {
    return "keep-scope";
  }
  if (input.scoped && input.searchText.length === 0 && input.next.length === 0) {
    return "exit-scope";
  }
  return "apply";
}
