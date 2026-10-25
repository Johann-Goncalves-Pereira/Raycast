import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { BrowserDefinition } from "./browser-catalog";
import { TTL, cacheKey, readFresh, readStale, writeCache } from "./cache";
import { domainFromUrl } from "./classify";
import { lastUsedProfileDir } from "./profile";

export type HistoryItem = {
  url: string;
  title: string;
  domain: string;
  lastVisitTime: number;
  visitCount: number;
};

export type HistoryRow = {
  url: string;
  title: string | null;
  last_visit_time: number;
  visit_count: number;
};

const INTERNAL_URL_RE =
  /^(chrome|edge|brave|opera|vivaldi|helium|arc|chrome-extension|about|devtools|view-source):/i;

function isInternalUrl(url: string): boolean {
  return INTERNAL_URL_RE.test(url);
}

function copyDbForRead(historyPath: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "browser-spotlight-history-"));
  const dbPath = join(dir, "History");
  copyFileSync(historyPath, dbPath);
  for (const suffix of ["-wal", "-shm", "-journal"] as const) {
    const side = `${historyPath}${suffix}`;
    if (existsSync(side)) {
      try {
        copyFileSync(side, `${dbPath}${suffix}`);
      } catch {
        // ignore locked sidecars
      }
    }
  }
  return { dir, dbPath };
}

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Drop trailing slash on path-only roots for light dedupe
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Map Chromium `urls` rows into history items (exported for tests). */
export function mapHistoryRows(rows: HistoryRow[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url || isInternalUrl(url)) continue;

    const key = normalizeUrlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);

    const title = (row.title ?? "").trim();
    const domain = domainFromUrl(url);
    items.push({
      url,
      title: title || domain || url,
      domain,
      lastVisitTime: Number(row.last_visit_time) || 0,
      visitCount: Number(row.visit_count) || 0,
    });
  }

  return items;
}

function readHistoryRows(historyPath: string): HistoryRow[] {
  if (!existsSync(historyPath)) return [];

  let dir: string | undefined;
  try {
    const copied = copyDbForRead(historyPath);
    dir = copied.dir;
    const output = execFileSync(
      "sqlite3",
      [
        copied.dbPath,
        "-json",
        `SELECT url, title, last_visit_time, visit_count
         FROM urls
         WHERE hidden = 0
           AND url NOT LIKE 'chrome://%'
           AND url NOT LIKE 'chrome-extension://%'
           AND url NOT LIKE 'edge://%'
           AND url NOT LIKE 'brave://%'
           AND url NOT LIKE 'about:%'
         ORDER BY last_visit_time DESC
         LIMIT 200`,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    if (!output.trim()) return [];
    return JSON.parse(output) as HistoryRow[];
  } catch {
    return [];
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // temp cleanup best-effort
      }
    }
  }
}

/** Synchronous stale seed for Raycast List first paint. */
export function peekCachedHistory(bundleId: string): HistoryItem[] | undefined {
  return readStale<HistoryItem[]>(cacheKey("history", bundleId));
}

/**
 * Recent history from the frontmost Chromium browser profile.
 * WebKit browsers (Safari/Orion) return [].
 * Fresh cache skips SQLite; otherwise reload and fall back to stale on error.
 */
export function getBrowserHistory(browser: BrowserDefinition): HistoryItem[] {
  if (browser.engine === "webkit") return [];

  const key = cacheKey("history", browser.bundleId);
  const fresh = readFresh<HistoryItem[]>(key, TTL.history);
  if (fresh) return fresh;

  const stale = readStale<HistoryItem[]>(key);
  const profileDir = lastUsedProfileDir(browser);
  if (!profileDir) return stale ?? [];

  try {
    const historyPath = join(profileDir, "History");
    const items = mapHistoryRows(readHistoryRows(historyPath));
    writeCache(key, items);
    return items;
  } catch {
    return stale ?? [];
  }
}

function matchesDomainFilter(item: HistoryItem, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const host = item.domain.toLowerCase();
  return domains.some((d) => {
    const normalized = d.replace(/^www\./, "").toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

/**
 * Filter history by optional domain scope and a simple query (title/url/domain).
 * Callers that use Fuse can pass query="" and filter themselves.
 */
export function filterHistory(
  items: HistoryItem[],
  query: string,
  domainFilter?: string[],
  limit = 12,
): HistoryItem[] {
  const domains = domainFilter?.filter(Boolean) ?? [];
  let filtered =
    domains.length > 0
      ? items.filter((item) => matchesDomainFilter(item, domains))
      : items;

  const q = query.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.url.toLowerCase().includes(q) ||
        item.domain.toLowerCase().includes(q),
    );
  }

  return filtered.slice(0, limit);
}
