export type DismissKey = "escape" | "backspace";
export type DismissAction = "close" | "exit-scope" | "type";

/**
 * Escape always leaves Omnibar. Empty Backspace leaves a bang, or closes the
 * window when nothing is scoped. A non-empty query still deletes characters.
 */
export function dismissDecision(input: {
  key: DismissKey;
  queryEmpty: boolean;
  scoped: boolean;
}): DismissAction {
  if (input.key === "escape") return "close";
  if (!input.queryEmpty) return "type";
  if (input.scoped) return "exit-scope";
  return "close";
}

export function queryStateRecord(input: {
  searchText: string;
  scoped: boolean;
}): { empty: boolean; scoped: boolean } {
  return {
    empty: input.searchText.length === 0,
    scoped: input.scoped,
  };
}
