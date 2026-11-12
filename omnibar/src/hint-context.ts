import type { BrowserDefinition } from "./browser-catalog";
import { positivePid, type LastBrowserHint } from "./last-browser";
import {
  browserForOmnibarOpen,
  type ExclusionPrefs,
} from "./pick-running-browser";

export type HintedContext = {
  allowed: true;
  browser: BrowserDefinition;
  /** Zen process that was focused when Cmd+P fired. */
  focusedPid?: number;
  frontmost: {
    name: string;
    bundleId: string;
    path: string;
  };
};

/**
 * A fresh Cmd+P hint names the browser. Paint from it and skip the process
 * scan. An excluded or unknown hint returns undefined so the slow path runs.
 */
export function contextFromHint(
  hint: LastBrowserHint | undefined,
  prefs: ExclusionPrefs | undefined,
  pathFor: (bundleId: string) => string,
): HintedContext | undefined {
  if (!hint?.bundleId) return undefined;
  const browser = browserForOmnibarOpen({
    frontBundle: "com.raycast.macos",
    hintBundleId: hint.bundleId,
    runningBundleIds: [],
    prefs,
  });
  if (!browser) return undefined;
  return {
    allowed: true,
    browser,
    focusedPid: positivePid(hint.pid),
    frontmost: {
      name: hint.name || browser.name,
      bundleId: browser.bundleId,
      path: pathFor(browser.bundleId),
    },
  };
}
