import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { BrowserDefinition } from "./browser-catalog";
import { TTL, cacheKey, readFresh, readStale, writeCache } from "./cache";
import { domainFromUrl } from "./classify";
import {
  geckoProfileDir,
  lastUsedProfileDir,
  safariHistoryDbPath,
} from "./profile";

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
  /^(chrome|edge|brave|opera|vivaldi|helium|arc|chrome-extension|about|place|moz-extension|resource|devtools|view-source|safari-extension):/i;

/** Safari / WebKit Cocoa epoch (2001-01-01) → Unix seconds offset. */
export const COCOA_EPOCH_OFFSET_SECONDS = 978_307_200;

function isInternalUrl(url: string): boolean {
  return INTERNAL_URL_RE.test(url);
}

function copyDbForRead(
  historyPath: string,
  copyName = "History",
): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "omnibar-history-"));
  const dbPath = join(dir, copyName);
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
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Map normalized history rows into HistoryItem[] (exported for tests). */
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

function querySqliteJson(dbPath: string, sql: string): HistoryRow[] {
  const output = execFileSync("sqlite3", [dbPath, "-json", sql], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!output.trim()) return [];
  return JSON.parse(output) as HistoryRow[];
}

function withCopiedDb<T>(
  historyPath: string,
  copyName: string,
  read: (dbPath: string) => T,
): T | undefined {
  if (!existsSync(historyPath)) return undefined;
  let dir: string | undefined;
  try {
    const copied = copyDbForRead(historyPath, copyName);
    dir = copied.dir;
    return read(copied.dbPath);
  } catch {
    return undefined;
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

function readChromiumHistoryRows(historyPath: string): HistoryRow[] {
  return (
    withCopiedDb(historyPath, "History", (dbPath) =>
      querySqliteJson(
        dbPath,
        `SELECT url, title, last_visit_time, visit_count
         FROM urls
         WHERE hidden = 0
           AND url NOT LIKE 'chrome://%'
           AND url NOT LIKE 'chrome-extension://%'
           AND url NOT LIKE 'edge://%'
           AND url NOT LIKE 'brave://%'
           AND url NOT LIKE 'about:%'
         ORDER BY visit_count DESC, last_visit_time DESC
         LIMIT 200`,
      ),
    ) ?? []
  );
}

/** Mozilla places.sqlite → HistoryRow (last_visit_date is µs since Unix epoch). */
export function readGeckoHistoryRows(placesPath: string): HistoryRow[] {
  return (
    withCopiedDb(placesPath, basename(placesPath) || "places.sqlite", (dbPath) =>
      querySqliteJson(
        dbPath,
        `SELECT url, title,
                last_visit_date AS last_visit_time,
                visit_count
         FROM moz_places
         WHERE hidden = 0
           AND last_visit_date IS NOT NULL
           AND url NOT LIKE 'about:%'
           AND url NOT LIKE 'place:%'
           AND url NOT LIKE 'moz-extension://%'
         ORDER BY visit_count DESC, last_visit_date DESC
         LIMIT 200`,
      ),
    ) ?? []
  );
}

/**
 * Safari History.db → HistoryRow.
 * visit_time is Cocoa absolute time; convert to Unix µs-ish integer for sorting
 * by storing milliseconds since Unix epoch * 1000? Chromium uses µs since
 * Windows epoch; we only need relative ordering — store Unix ms.
 */
export function readSafariHistoryRows(historyDbPath: string): HistoryRow[] {
  return (
    withCopiedDb(historyDbPath, "History.db", (dbPath) => {
      const raw = querySqliteJson(
        dbPath,
        `SELECT history_items.url AS url,
                history_items.title AS title,
                MAX(history_visits.visit_time) AS last_visit_time,
                COUNT(history_visits.id) AS visit_count
         FROM history_items
         INNER JOIN history_visits
           ON history_visits.history_item = history_items.id
         WHERE history_items.url NOT LIKE 'about:%'
           AND history_items.url NOT LIKE 'file:%'
         GROUP BY history_items.id
         ORDER BY visit_count DESC, last_visit_time DESC
         LIMIT 200`,
      );
      return raw.map((row) => ({
        ...row,
        // Cocoa seconds → Unix milliseconds
        last_visit_time: Math.round(
          (Number(row.last_visit_time) + COCOA_EPOCH_OFFSET_SECONDS) * 1000,
        ),
      }));
    }) ?? []
  );
}

/** Synchronous stale seed for Raycast List first paint. */
export function peekCachedHistory(bundleId: string): HistoryItem[] | undefined {
  return readStale<HistoryItem[]>(cacheKey("history", bundleId));
}

function loadHistoryItems(browser: BrowserDefinition): HistoryItem[] {
  if (browser.engine === "webkit") {
    return mapHistoryRows(readSafariHistoryRows(safariHistoryDbPath()));
  }

  if (browser.engine === "gecko") {
    const profileDir = geckoProfileDir(browser);
    if (!profileDir) return [];
    return mapHistoryRows(
      readGeckoHistoryRows(join(profileDir, "places.sqlite")),
    );
  }

  // Chromium / Arc / Dia
  const profileDir = lastUsedProfileDir(browser);
  if (!profileDir) return [];
  return mapHistoryRows(readChromiumHistoryRows(join(profileDir, "History")));
}

/**
 * Recent history for the frontmost browser (Chromium, Safari, or Zen/Gecko).
 * Fresh cache skips SQLite; otherwise reload and fall back to stale on error.
 */
export function getBrowserHistory(browser: BrowserDefinition): HistoryItem[] {
  const key = cacheKey("history", browser.bundleId);
  const fresh = readFresh<HistoryItem[]>(key, TTL.history);
  if (fresh) return fresh;

  const stale = readStale<HistoryItem[]>(key);
  try {
    const items = loadHistoryItems(browser);
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

/** Most-opened links first. A newer visit breaks a tie. */
export function rankHistory(items: readonly HistoryItem[]): HistoryItem[] {
  return [...items].sort((left, right) => {
    if (right.visitCount !== left.visitCount) {
      return right.visitCount - left.visitCount;
    }
    return right.lastVisitTime - left.lastVisitTime;
  });
}

/**
 * Filter history by optional domain scope and a simple query (title/url/domain).
 * Callers that use Fuse can pass query="" and filter themselves.
 * The result is ranked by how often each link was opened.
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

  return rankHistory(filtered).slice(0, limit);
}
