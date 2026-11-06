import { bangItemId, historyItemId } from "./bangs";
import { navigableHttpUrl } from "./submit-target";

export const NEW_SEARCH_ITEM_ID = "query-search";
export const SCOPED_SEARCH_ITEM_ID = "scoped-search";
export const MRU_TAB_LIMIT = 5;
export const QUICK_PICK_LIMIT = 2;

export type ResultSection =
  | "actions"
  | "answers"
  | "search"
  | "space"
  | "quick"
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
 * Empty: MRU tabs → commands → this Space → quick picks → recent → bookmarks.
 * `/`: commands only.
 * `@`: bang catalog.
 * Typing: search → this Space → quick picks → history → tabs → answers → bookmarks → commands.
 * Cmd+Shift: only pages open on the current Space.
 */
export function sectionsForQuery(
  query: string,
  options?: { spaceOnly?: boolean },
): ResultSection[] {
  if (options?.spaceOnly) return ["space"];
  if (isActionScopeQuery(query)) return ["commands"];
  if (isBangListingQuery(query)) return ["bangs"];
  if (query.trim().length === 0) {
    return ["actions", "commands", "space", "quick", "history", "bookmarks"];
  }
  return [
    "search",
    "space",
    "quick",
    "history",
    "actions",
    "answers",
    "bookmarks",
    "commands",
  ];
}

/** The preview above the full history and suggestion lists. */
export function quickPicks<T>(
  items: readonly T[],
  limit = QUICK_PICK_LIMIT,
): T[] {
  return items.slice(0, limit);
}

/** Rows that stay in the full list after Quick has taken its preview. */
export function listAfterQuick<T>(
  items: readonly T[],
  limit = QUICK_PICK_LIMIT,
): T[] {
  return items.slice(limit);
}

export function siteHost(domain: string): string {
  return domain.trim().replace(/^www\./i, "").toLowerCase();
}

/** One history row per site. `www.youtube.com` and `youtube.com` are the same site. */
export function uniqueBySite<T extends { domain: string; url?: string }>(
  items: readonly T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const host = siteHost(item.domain);
    const key = host || item.url || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function uniqueLabels(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const label = item.trim();
    const key = label.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(label);
  }
  return unique;
}

/** Cap empty-state open tabs (Arc shows ~5 MRU). */
export function mruTabs<T>(tabs: readonly T[], limit = MRU_TAB_LIMIT): T[] {
  return tabs.slice(0, limit);
}

/**
 * Arrow keys must stick. The pin is only the default row for a new query.
 * A different reported row replaces it, so the highlight cannot snap back.
 */
export function selectionAfterReport(input: {
  pinnedId: string | undefined;
  reportedId: string | undefined;
}): { selectedId: string | undefined; pinnedId: string | undefined } {
  return { selectedId: input.reportedId, pinnedId: undefined };
}

/** History and suggestion refreshes keep the current row. Typing or a new bang does not. */
export function shouldResetSelection(input: {
  previousQueryKey: string | null;
  nextQueryKey: string;
}): boolean {
  return input.previousQueryKey !== input.nextQueryKey;
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

  if (navigableHttpUrl(input.query)) return NEW_SEARCH_ITEM_ID;

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
