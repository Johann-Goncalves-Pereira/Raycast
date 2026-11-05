import {
  BROWSER_CATALOG,
  findBrowserByBundleId,
  type BrowserDefinition,
} from "./browser-catalog";

/** Preference map used for exclusions (Raycast-free for unit tests). */
export type ExclusionPrefs = Record<string, boolean | string | undefined>;

const ALWAYS_EXCLUDED_BUNDLE_IDS = new Set(["company.thebrowser.Browser"]);

function isExcluded(
  bundleId: string,
  prefs?: ExclusionPrefs,
): boolean {
  if (ALWAYS_EXCLUDED_BUNDLE_IDS.has(bundleId)) return true;
  if (!prefs) return false;
  return prefs[`exclude_${bundleId}`] === true;
}

/** Pure helper: pick first allowed catalog browser present in running set. */
export function pickRunningBrowser(
  runningBundleIds: readonly string[],
  prefs?: ExclusionPrefs,
): BrowserDefinition | undefined {
  const set = new Set(runningBundleIds);
  for (const browser of BROWSER_CATALOG) {
    if (isExcluded(browser.bundleId, prefs)) continue;
    if (set.has(browser.bundleId)) return browser;
  }
  if (
    set.has("net.imput.helium.helper") &&
    !isExcluded("net.imput.helium", prefs)
  ) {
    return findBrowserByBundleId("net.imput.helium");
  }
  return undefined;
}
