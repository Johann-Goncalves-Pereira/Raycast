import { getPreferenceValues } from "@raycast/api";
import {
  BROWSER_CATALOG,
  type BrowserDefinition,
  findBrowserByBundleId,
  KARABINER_RULE_DESCRIPTION,
  profileRootFor,
  type BrowserEngine,
} from "./browser-catalog";

export type { BrowserDefinition, BrowserEngine };
export {
  BROWSER_CATALOG,
  findBrowserByBundleId,
  KARABINER_RULE_DESCRIPTION,
  profileRootFor,
};

export type ExtensionPreferences = {
  searchEngine: "google" | "duckduckgo" | "bing";
  enableSuggestions: boolean;
} & Record<string, boolean | string>;

export function excludePreferenceName(bundleId: string): string {
  return `exclude_${bundleId}`;
}

export function getExcludedBundleIds(
  prefs?: ExtensionPreferences,
): Set<string> {
  const preferences =
    prefs ??
    (getPreferenceValues<ExtensionPreferences>() as ExtensionPreferences);
  const excluded = new Set<string>();
  for (const browser of BROWSER_CATALOG) {
    const key = excludePreferenceName(browser.bundleId);
    if (preferences[key] === true) {
      excluded.add(browser.bundleId);
    }
  }
  return excluded;
}

export function getAllowedBrowsers(
  prefs?: ExtensionPreferences,
): BrowserDefinition[] {
  const excluded = getExcludedBundleIds(prefs);
  return BROWSER_CATALOG.filter((b) => !excluded.has(b.bundleId));
}

export function isBrowserExcluded(
  bundleId: string | undefined,
  prefs?: ExtensionPreferences,
): boolean {
  if (!bundleId) return true;
  return getExcludedBundleIds(prefs).has(bundleId);
}
