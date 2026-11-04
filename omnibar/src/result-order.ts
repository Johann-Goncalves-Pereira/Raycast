import { bangItemId, historyItemId } from "./bangs";

export const NEW_SEARCH_ITEM_ID = "query-search";
export const SCOPED_SEARCH_ITEM_ID = "scoped-search";
export const MRU_TAB_LIMIT = 5;

export type ResultSection =
  | "actions"
  | "answers"
  | "search"
  | "history"
  | "bookmarks"
  | "commands"
  | "bangs";

export type QueryScopeMode = "unified" | "commands" | "bangs";

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

/** `/` alone or `/…` scopes the bar to browser commands. */
export function isActionScopeQuery(query: string): boolean {
  return query.startsWith("/");
}

export function isBangListingQuery(query: string): boolean {
  return query.trim() === "@";
}

export function parseQueryScope(query: string): {
  mode: QueryScopeMode;
  filterQuery: string;
} {
  if (isActionScopeQuery(query)) {
    return {
      mode: "commands",
      filterQuery: query.slice(1).trim(),
    };
  }
  if (isBangListingQuery(query)) {
    return { mode: "bangs", filterQuery: "" };
  }
  return { mode: "unified", filterQuery: query.trim() };
}

/**
 * Empty: MRU tabs → commands → recent → bookmarks.
 * `/`: commands only.
 * `@`: bang catalog.
 * Typing: search row → history → tabs → answers → bookmarks → commands.
 */
export function sectionsForQuery(query: string): ResultSection[] {
  if (isActionScopeQuery(query)) return ["commands"];
  if (isBangListingQuery(query)) return ["bangs"];
  if (query.trim().length === 0) {
    return ["actions", "commands", "history", "bookmarks"];
  }
  return ["search", "history", "actions", "answers", "bookmarks", "commands"];
}

/** Cap empty-state open tabs (Arc shows ~5 MRU). */
export function mruTabs<T>(tabs: readonly T[], limit = MRU_TAB_LIMIT): T[] {
  return tabs.slice(0, limit);
}

/**
 * Default selection after the query changes.
 * Switch-to-Tab wins; else first history; else the search row.
 */
export function selectionAfterType(input: {
  query: string;
  scoped: boolean;
  matchingTabs?: readonly ActionTab[];
  historyUrls?: readonly string[];
  commandIds?: readonly string[];
  bangIds?: readonly string[];
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
  if (scope.mode === "bangs") {
    const bangId = input.bangIds?.[0];
    return bangId ? bangItemId(bangId) : undefined;
  }

  const tab = input.matchingTabs?.[0];
  if (tab) return tabItemId(tab);

  const historyUrl = input.historyUrls?.[0];
  if (historyUrl) return historyItemId(historyUrl);

  if (input.answerId) return `answer-${input.answerId}`;

  if (scope.filterQuery.length === 0) return undefined;
  return NEW_SEARCH_ITEM_ID;
}

export function firstActionItemId(input: {
  siteIds: readonly string[];
  bangIds?: readonly string[];
  tabs: readonly ActionTab[];
  extensionIds?: readonly string[];
  commandIds?: readonly string[];
}): string | undefined {
  const bangId = input.bangIds?.[0];
  if (bangId) return bangItemId(bangId);
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

/**
 * Tab completes a partial bang / site keyword to the first ranked action.
 * No jump on empty or `/` command scope.
 */
export function tabJumpTarget(input: {
  query: string;
  siteIds: readonly string[];
  bangIds?: readonly string[];
  tabs: readonly ActionTab[];
  extensionIds?: readonly string[];
  commandIds?: readonly string[];
}): string | undefined {
  if (input.query.trim().length === 0) return undefined;
  if (isActionScopeQuery(input.query)) return undefined;
  return firstActionItemId(input);
}

export { bangItemId, historyItemId };
