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

const RAYCAST_BUNDLE_IDS = new Set([
  "com.raycast.macos",
  "com.raycast.macos.debug",
]);

function catalogBrowser(bundleId: string): BrowserDefinition | undefined {
  return (
    findBrowserByBundleId(bundleId) ??
    (bundleId === "net.imput.helium.helper"
      ? findBrowserByBundleId("net.imput.helium")
      : undefined)
  );
}

/**
 * The frontmost allowed browser wins. Otherwise the Cmd+P hint is used even
 * when Raycast reports Finder or itself, then any other running browser.
 */
export function browserForOmnibarOpen(input: {
  frontBundle: string;
  hintBundleId: string | undefined;
  runningBundleIds: readonly string[];
  prefs?: ExclusionPrefs;
}): BrowserDefinition | undefined {
  const front = catalogBrowser(input.frontBundle);
  if (
    front &&
    !RAYCAST_BUNDLE_IDS.has(input.frontBundle) &&
    !isExcluded(front.bundleId, input.prefs)
  ) {
    return front;
  }

  if (input.hintBundleId) {
    const hinted = catalogBrowser(input.hintBundleId);
    if (hinted && !isExcluded(hinted.bundleId, input.prefs)) {
      return hinted;
    }
  }

  return pickRunningBrowser(input.runningBundleIds, input.prefs);
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
