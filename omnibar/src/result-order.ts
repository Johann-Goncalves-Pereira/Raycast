export const NEW_SEARCH_ITEM_ID = "query-search";
export const SCOPED_SEARCH_ITEM_ID = "scoped-search";
export const MRU_TAB_LIMIT = 5;
export const ACTION_SCOPE_PREFIX = "/ ";

export type ResultSection =
  | "actions"
  | "answers"
  | "search"
  | "history"
  | "bookmarks"
  | "commands";

export type QueryScopeMode = "unified" | "commands";

export type ActionTab = {
  windowId: string;
  tabId: string;
  url: string;
};

export function tabItemId(tab: ActionTab): string {
  return `tab-${tab.windowId}-${tab.tabId}-${tab.url}`;
}

export function commandItemId(id: string): string {
  return `cmd-${id}`;
}

/** Slash + space scopes the bar to browser actions only (Arc `/ ` grammar). */
export function isActionScopeQuery(query: string): boolean {
  return query.startsWith(ACTION_SCOPE_PREFIX);
}

export function parseQueryScope(query: string): {
  mode: QueryScopeMode;
  filterQuery: string;
} {
  if (isActionScopeQuery(query)) {
    return {
      mode: "commands",
      filterQuery: query.slice(ACTION_SCOPE_PREFIX.length).trim(),
    };
  }
  return { mode: "unified", filterQuery: query.trim() };
}

/**
 * Empty: MRU tabs → suggested commands → recent → bookmarks.
 * `/ `: commands only.
 * Typing: tabs first (Switch-to-Tab), then answers/search/history/bookmarks/commands.
 */
export function sectionsForQuery(query: string): ResultSection[] {
  if (isActionScopeQuery(query)) return ["commands"];
  if (query.trim().length === 0) {
    return ["actions", "commands", "history", "bookmarks"];
  }
  return ["actions", "answers", "search", "history", "bookmarks", "commands"];
}

/** Cap empty-state open tabs (Arc shows ~5 MRU). */
export function mruTabs<T>(tabs: readonly T[], limit = MRU_TAB_LIMIT): T[] {
  return tabs.slice(0, limit);
}

/**
 * Row to select after the query changes.
 * Open-tab matches win over clean search; inline answers win over search;
 * history never steals focus.
 */
export function selectionAfterType(input: {
  query: string;
  scoped: boolean;
  matchingTabs?: readonly ActionTab[];
  commandIds?: readonly string[];
  answerId?: string;
}): string | undefined {
  if (input.scoped) {
    if (input.query.trim().length === 0) return undefined;
    return SCOPED_SEARCH_ITEM_ID;
  }

  const scope = parseQueryScope(input.query);
  if (scope.mode === "commands") {
    const commandId = input.commandIds?.[0];
    return commandId ? commandItemId(commandId) : undefined;
  }

  const tab = input.matchingTabs?.[0];
  if (tab) return tabItemId(tab);

  if (input.answerId) return `answer-${input.answerId}`;

  if (scope.filterQuery.length === 0) return undefined;
  return NEW_SEARCH_ITEM_ID;
}

export function firstActionItemId(input: {
  siteIds: readonly string[];
  tabs: readonly ActionTab[];
  extensionIds?: readonly string[];
  commandIds?: readonly string[];
}): string | undefined {
  const siteId = input.siteIds[0];
  if (siteId) return `site-${siteId}`;
  const tab = input.tabs[0];
  if (tab) return tabItemId(tab);
  const extensionId = input.extensionIds?.[0];
  if (extensionId) return `ext-${extensionId}`;
  const commandId = input.commandIds?.[0];
  if (commandId) return commandItemId(commandId);
  return undefined;
}

/** Tab moves the highlight to the first action. No jump on empty or `/ ` scope. */
export function tabJumpTarget(input: {
  query: string;
  siteIds: readonly string[];
  tabs: readonly ActionTab[];
  extensionIds?: readonly string[];
  commandIds?: readonly string[];
}): string | undefined {
  if (input.query.trim().length === 0) return undefined;
  if (isActionScopeQuery(input.query)) return undefined;
  return firstActionItemId(input);
}
