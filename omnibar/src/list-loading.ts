/**
 * A Cmd+P hint can paint the list immediately. A cold open waits for context,
 * and a refresh must not put the spinner back once rows are on screen.
 */
export function shouldBlockList(input: {
  hasHint: boolean;
  contextReady: boolean;
  hasCachedRows: boolean;
  listsLoading: boolean;
}): boolean {
  if (input.hasHint) return false;
  if (!input.contextReady) return true;
  if (input.hasCachedRows) return false;
  return input.listsLoading;
}
