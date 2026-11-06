import { domainFromUrl, type Tab } from "./classify";

export type ListedPage = Tab & { loaded: boolean };

/** A page with a real address. New-tab placeholders are still loading. */
export function isLoadedPage(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === "about:blank" ||
    lower.startsWith("about:blank?") ||
    lower.startsWith("about:blank#") ||
    lower.startsWith("about:newtab") ||
    lower.startsWith("about:home") ||
    lower.startsWith("chrome://newtab") ||
    lower.startsWith("chrome://new-tab-page") ||
    lower.startsWith("edge://newtab") ||
    lower.startsWith("zen://newtab")
  ) {
    return false;
  }
  return /^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed);
}

export function parseListedPages(raw: string | undefined): ListedPage[] {
  if (!raw) return [];
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [title, url, windowId, tabId, loadedFlag] = block.split("\n");
      const pageUrl = url || "";
      return {
        title: title || pageUrl || "Untitled",
        url: pageUrl,
        domain: domainFromUrl(pageUrl),
        windowId: windowId || "0",
        tabId: tabId || "1",
        loaded: loadedFlag !== "false",
      };
    })
    .filter((page) => page.url.length > 0);
}

export function parseOpenSpaceHeld(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { openSpace?: unknown };
    return parsed.openSpace === true;
  } catch {
    return false;
  }
}

/** System Events only lists windows on the current Space. */
export function onScreenWindowsScript(bundleId: string): string {
  const escaped = bundleId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `tell application "System Events"
  set matches to every process whose bundle identifier is "${escaped}"
  if matches is {} then return ""
  tell item 1 of matches
    set output to ""
    repeat with w in windows
      set output to output & (name of w as text) & linefeed
    end repeat
    return output
  end tell
end tell`;
}

export function parseWindowNameLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseOnScreenTitles(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { titles?: unknown };
    if (!Array.isArray(parsed.titles)) return [];
    return parsed.titles.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

/** Zen and Firefox put the browser name after the page title. */
export function titleOnCurrentSpace(
  tabTitle: string,
  onScreenTitles: readonly string[],
): boolean {
  const title = tabTitle.trim();
  if (!title) return false;
  return onScreenTitles.some((raw) => {
    const windowTitle = raw.trim();
    if (!windowTitle) return false;
    return (
      windowTitle === title ||
      windowTitle.startsWith(title) ||
      title.startsWith(windowTitle)
    );
  });
}

/**
 * Loaded pages whose window is on the current Space.
 * A window counts when one of its tab titles is an on-screen window title.
 */
export function pagesOnThisSpace<
  T extends {
    title: string;
    url: string;
    windowId: string;
    loaded?: boolean;
  },
>(pages: readonly T[], onScreenTitles: readonly string[]): T[] {
  const windowIds = new Set<string>();
  for (const page of pages) {
    if (titleOnCurrentSpace(page.title, onScreenTitles)) {
      windowIds.add(page.windowId);
    }
  }
  return pages.filter(
    (page) =>
      windowIds.has(page.windowId) &&
      page.loaded !== false &&
      isLoadedPage(page.url),
  );
}

export function matchingSpacePages<
  T extends {
    title: string;
    url: string;
    domain: string;
    windowId: string;
    loaded?: boolean;
  },
>(
  pages: readonly T[],
  onScreenTitles: readonly string[],
  query: string,
): T[] {
  const onSpace = pagesOnThisSpace(pages, onScreenTitles);
  const needle = query.trim().toLowerCase();
  if (!needle) return onSpace;
  return onSpace.filter((page) => {
    return (
      page.title.toLowerCase().includes(needle) ||
      page.url.toLowerCase().includes(needle) ||
      page.domain.toLowerCase().includes(needle)
    );
  });
}
