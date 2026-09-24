export interface TabCandidate {
  id?: number;
  url?: string;
}

/** The locked document only. A prefix or another tab is not a match. */
export function findLockedTabId(
  tabs: readonly TabCandidate[],
  lockedURL: string,
): number | null {
  if (lockedURL.length === 0) {
    return null;
  }
  for (const tab of tabs) {
    if (tab.url === lockedURL && typeof tab.id === "number") {
      return tab.id;
    }
  }
  return null;
}
