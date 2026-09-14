import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { BrowserDefinition } from "./browser-catalog";
import { lastUsedProfileDir } from "./profile";

export type BrowserKeywordEngine = {
  id: string;
  name: string;
  keywords: string[];
  domains: string[];
  urlTemplate: string;
};

export type KeywordRow = {
  id: number;
  short_name: string;
  keyword: string;
  url: string;
  is_active: number;
  prepopulate_id: number;
  usage_count: number;
};

function isInternalBrowserUrl(url: string): boolean {
  return /^(chrome|edge|brave|opera|vivaldi|helium|arc|chrome-extension|about):/i.test(
    url,
  );
}

/** Expand Chromium TemplateURL placeholders into a concrete search URL. */
export function expandSearchUrl(template: string, query: string): string {
  const encoded = encodeURIComponent(query);
  let url = template
    // Chromium / ungoogled host substitutions used in some builds (e.g. Helium)
    .replace(/9oo91e\.qjz9zk/gi, "google.com")
    .replace(/\{google:baseURL\}/gi, "https://www.google.com/")
    .replace(/\{google:baseSearchURL\}/gi, "https://www.google.com/search?")
    .replace(/\{yandex:searchPath\}/gi, "search/")
    .replace(/\{searchTerms\}/g, encoded)
    .replace(/%s/g, encoded)
    .replace(/\{inputEncoding\}/g, "UTF-8");

  // Drop remaining Chromium tokens ({google:RLZ}, etc.)
  url = url.replace(/\{[^}]+\}/g, "");
  return url;
}

function isSearchableTemplate(url: string): boolean {
  return url.includes("{searchTerms}") || url.includes("%s");
}

function domainFromTemplate(url: string): string | undefined {
  try {
    const expanded = expandSearchUrl(url, "x");
    return new URL(expanded).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function keywordAliases(
  keyword: string,
  name: string,
  domain?: string,
): string[] {
  const aliases = new Set<string>();
  const add = (value: string | undefined) => {
    const v = value?.trim().toLowerCase();
    if (v) aliases.add(v);
  };
  add(keyword);
  add(name);
  add(domain);
  if (keyword.includes(".")) {
    add(keyword.split(".")[0]);
  }
  if (keyword.startsWith("@")) {
    add(keyword.slice(1));
  }
  return Array.from(aliases);
}

function rowToEngine(row: KeywordRow): BrowserKeywordEngine | null {
  if (!row.keyword?.trim() || !row.url?.trim()) return null;
  if (!isSearchableTemplate(row.url)) return null;
  if (isInternalBrowserUrl(row.url)) return null;

  // Active site search, or built-in / prepopulated search engines.
  // Inactive OpenSearch discoveries stay out (Chrome “Inactive shortcuts”).
  const include = row.is_active === 1 || Number(row.prepopulate_id) > 0;
  if (!include) return null;

  const domain = domainFromTemplate(row.url);
  const keywords = keywordAliases(row.keyword, row.short_name, domain);

  return {
    id: `kw-${row.id}`,
    name: row.short_name || row.keyword,
    keywords,
    domains: domain ? [domain] : [],
    urlTemplate: row.url,
  };
}

function copyDbForRead(webDataPath: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "browser-spotlight-webdata-"));
  const dbPath = join(dir, "Web Data");
  copyFileSync(webDataPath, dbPath);
  for (const suffix of ["-wal", "-shm", "-journal"] as const) {
    const side = `${webDataPath}${suffix}`;
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

function readKeywordsFromWebData(webDataPath: string): KeywordRow[] {
  if (!existsSync(webDataPath)) return [];

  let dir: string | undefined;
  try {
    const copied = copyDbForRead(webDataPath);
    dir = copied.dir;
    const output = execFileSync(
      "sqlite3",
      [
        copied.dbPath,
        "-json",
        `SELECT id, short_name, keyword, url, is_active, prepopulate_id, usage_count
         FROM keywords
         ORDER BY usage_count DESC, short_name ASC`,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    if (!output.trim()) return [];
    return JSON.parse(output) as KeywordRow[];
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

/**
 * Search engines + active site-search shortcuts from the frontmost
 * Chromium/Arc browser profile (chrome://settings/searchEngines).
 */
export function getBrowserSearchEngines(
  browser: BrowserDefinition,
): BrowserKeywordEngine[] {
  if (browser.engine === "webkit") return [];

  const profileDir = lastUsedProfileDir(browser);
  if (!profileDir) return [];

  const webData = join(profileDir, "Web Data");
  return mapKeywordRowsToEngines(readKeywordsFromWebData(webData));
}

/** Map Chromium keywords rows to site/search engines (exported for tests). */
export function mapKeywordRowsToEngines(
  rows: KeywordRow[],
): BrowserKeywordEngine[] {
  const engines: BrowserKeywordEngine[] = [];
  const seenKeywords = new Set<string>();

  for (const row of rows) {
    const engine = rowToEngine(row);
    if (!engine) continue;
    const key = engine.keywords[0] ?? engine.id;
    if (seenKeywords.has(key)) continue;
    seenKeywords.add(key);
    engines.push(engine);
  }

  return engines;
}
