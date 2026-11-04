import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { BrowserDefinition } from "./browser-catalog";
import { TTL, cacheKey, readFresh, readStale, writeCache } from "./cache";
import { domainFromUrl } from "./classify";
import { lastUsedProfileDir } from "./profile";

export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  folderPath: string;
};

export type ChromiumBookmarkNode = {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  children?: ChromiumBookmarkNode[];
};

type ChromiumBookmarksFile = {
  roots?: Record<string, ChromiumBookmarkNode>;
};

const INTERNAL_URL_RE =
  /^(chrome|edge|brave|opera|vivaldi|helium|arc|chrome-extension|about|devtools|view-source|javascript):/i;

function isInternalUrl(url: string): boolean {
  return INTERNAL_URL_RE.test(url);
}

function walk(
  node: ChromiumBookmarkNode,
  folderPath: string,
  out: BookmarkItem[],
): void {
  const children = node.children ?? [];
  for (const child of children) {
    if (child.type === "folder" || (child.children && !child.url)) {
      const name = (child.name ?? "").trim() || "Folder";
      const nextPath = folderPath ? `${folderPath} / ${name}` : name;
      walk(child, nextPath, out);
      continue;
    }
    const url = child.url?.trim();
    if (!url || isInternalUrl(url)) continue;
    const title = (child.name ?? "").trim() || domainFromUrl(url) || url;
    out.push({
      id: child.id ?? `${folderPath}:${url}`,
      title,
      url,
      domain: domainFromUrl(url),
      folderPath,
    });
  }
}

/** Flatten Chromium Bookmarks JSON roots into a list (exported for tests). */
export function flattenBookmarkTree(
  root: ChromiumBookmarkNode,
): BookmarkItem[] {
  const out: BookmarkItem[] = [];
  walk(root, "", out);
  return out;
}

export function parseBookmarksFile(raw: string): BookmarkItem[] {
  try {
    const parsed = JSON.parse(raw) as ChromiumBookmarksFile;
    const roots = parsed.roots ?? {};
    const items: BookmarkItem[] = [];
    for (const [key, node] of Object.entries(roots)) {
      if (!node || typeof node !== "object") continue;
      if (key === "synced") continue;
      const folderName =
        (node.name ?? "").trim() ||
        (key === "bookmark_bar"
          ? "Bookmark Bar"
          : key === "other"
            ? "Other Bookmarks"
            : key);
      walk(node, folderName, items);
    }
    return items;
  } catch {
    return [];
  }
}

function loadBookmarksFromDisk(browser: BrowserDefinition): BookmarkItem[] {
  const profileDir = lastUsedProfileDir(browser);
  if (!profileDir) return [];
  const path = join(profileDir, "Bookmarks");
  if (!existsSync(path)) return [];
  try {
    return parseBookmarksFile(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

/**
 * Bookmarks from the frontmost Chromium profile.
 * WebKit returns []. Uses stale-while-revalidate when a cache entry exists.
 */
export function getBrowserBookmarks(
  browser: BrowserDefinition,
): BookmarkItem[] {
  if (browser.engine === "webkit") return [];

  const key = cacheKey("bookmarks", browser.bundleId);
  const fresh = readFresh<BookmarkItem[]>(key, TTL.bookmarks);
  if (fresh) return fresh;

  const stale = readStale<BookmarkItem[]>(key);
  try {
    const items = loadBookmarksFromDisk(browser);
    writeCache(key, items);
    return items;
  } catch {
    return stale ?? [];
  }
}

/** Synchronous stale seed for Raycast List first paint. */
export function peekCachedBookmarks(
  bundleId: string,
): BookmarkItem[] | undefined {
  return readStale<BookmarkItem[]>(cacheKey("bookmarks", bundleId));
}
