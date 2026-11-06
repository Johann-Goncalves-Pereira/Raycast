import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { BrowserDefinition, BrowserEngine } from "./browser-catalog";
import { expandSearchUrl } from "./browser-engines";
import { TTL, cacheKey, readFresh, readStale, writeCache } from "./cache";
import { buildSearchUrl } from "./classify";
import { lastUsedProfileDir } from "./profile";

export type FallbackEngine = "google" | "duckduckgo" | "bing";

function isSearchTemplate(url: string): boolean {
  return url.includes("{searchTerms}") || url.includes("%s");
}

function templateUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const url = record.url ?? record.search_url;
  if (typeof url !== "string" || !isSearchTemplate(url)) return undefined;
  return url;
}

/** Chromium Preferences → the default search engine URL template. */
export function defaultSearchTemplateFromPreferences(
  value: unknown,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  const data = root.default_search_provider_data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).template_url_data;
    const fromNested = templateUrl(nested);
    if (fromNested) return fromNested;
  }
  return templateUrl(root.default_search_provider);
}

/**
 * Search URL for the typed text. A domain-shaped query stays a search,
 * it is not opened as a site.
 */
export function exactSearchUrl(
  query: string,
  template: string | undefined,
  fallback: FallbackEngine,
): string {
  const q = query.trim();
  if (template && isSearchTemplate(template)) {
    return expandSearchUrl(template, q);
  }
  return buildSearchUrl(q, fallback);
}

function appleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/** AppleScript that opens `url` in a new tab, or undefined when the engine has no dictionary. */
export function newTabScript(
  browserName: string,
  engine: BrowserEngine,
  url: string,
): string | undefined {
  const name = appleScriptString(browserName);
  const quoted = appleScriptString(url);
  if (engine === "chromium" || engine === "arc") {
    return `tell application "${name}"
  activate
  if (count of windows) = 0 then
    make new window
  end if
  tell front window to make new tab with properties {URL:"${quoted}"}
end tell`;
  }
  if (engine === "webkit") {
    return `tell application "${name}"
  activate
  if (count of windows) = 0 then
    make new document with properties {URL:"${quoted}"}
  else
    tell front window
      set current tab to (make new tab with properties {URL:"${quoted}"})
    end tell
  end if
end tell`;
  }
  if (engine === "gecko") {
    return `tell application "${name}"
  activate
  open location "${quoted}"
end tell`;
  }
  return undefined;
}

/** A new tab counts as opened only when AppleScript or the open fallback succeeded. */
export function newTabOpenSucceeded(
  scriptOk: boolean,
  fallbackOk: boolean,
): boolean {
  return scriptOk || fallbackOk;
}

function readPreferencesTemplate(profileDir: string): string | undefined {
  for (const name of ["Preferences", "Secure Preferences"]) {
    const path = join(profileDir, name);
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const template = defaultSearchTemplateFromPreferences(parsed);
      if (template) return template;
    } catch {
      // locked or partial write
    }
  }
  return undefined;
}

export function peekDefaultSearchTemplate(
  bundleId: string,
): string | undefined {
  return readStale<string>(cacheKey("default-search", bundleId));
}

export function getDefaultSearchTemplate(
  browser: BrowserDefinition,
): string | undefined {
  const key = cacheKey("default-search", browser.bundleId);
  const fresh = readFresh<string>(key, TTL.engines);
  if (fresh) return fresh;

  const stale = readStale<string>(key);
  if (browser.engine === "webkit" || browser.engine === "gecko") {
    return stale;
  }

  const profileDir = lastUsedProfileDir(browser);
  if (!profileDir) return stale;

  const template = readPreferencesTemplate(profileDir);
  if (!template) return stale;
  writeCache(key, template);
  return template;
}
