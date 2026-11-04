import { Application, getFrontmostApplication } from "@raycast/api";
import { execFileSync } from "node:child_process";
import {
  findBrowserByBundleId,
  type BrowserDefinition,
} from "./browser-catalog";
import {
  ExtensionPreferences,
  isBrowserExcluded,
} from "./browsers";
import { readLastBrowserHint } from "./last-browser";
import { pickRunningBrowser } from "./pick-running-browser";

const RAYCAST_BUNDLE_IDS = new Set([
  "com.raycast.macos",
  "com.raycast.macos.debug",
]);

export type OmnibarBrowserContext = {
  frontmost: Application;
  browser: BrowserDefinition;
  allowed: true;
};

export type OmnibarDeniedContext = {
  frontmost: Application;
  browser: null;
  allowed: false;
};

export type OmnibarContext = OmnibarBrowserContext | OmnibarDeniedContext;

/** Running GUI apps as bundleId → name (System Events), newest-front first-ish. */
function runningApplications(): Array<{ bundleId: string; name: string }> {
  try {
    const raw = execFileSync(
      "osascript",
      [
        "-e",
        `tell application "System Events"
  set procs to every process whose background only is false
  set out to ""
  repeat with p in procs
    try
      set bid to bundle identifier of p
      set n to name of p
      set out to out & bid & "\t" & n & linefeed
    end try
  end repeat
  return out
end tell`,
      ],
      { encoding: "utf8" },
    );
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [bundleId, ...rest] = line.split("\t");
        return { bundleId, name: rest.join("\t") || bundleId };
      });
  } catch {
    return [];
  }
}

function asApplication(bundleId: string, name: string): Application {
  return { name, path: "", bundleId };
}

/**
 * Deeplink/hotkey often focuses Raycast first. Prefer the true frontmost browser,
 * otherwise the first running allowed browser from the catalog order.
 */
export async function resolveOmnibarContext(
  prefs?: ExtensionPreferences,
): Promise<OmnibarContext> {
  const frontmost = await getFrontmostApplication();
  const frontBundle = frontmost.bundleId ?? "";

  if (!RAYCAST_BUNDLE_IDS.has(frontBundle)) {
    const browser = findBrowserByBundleId(frontBundle);
    if (browser && !isBrowserExcluded(frontBundle, prefs)) {
      return { frontmost, browser, allowed: true };
    }
    return { frontmost, browser: null, allowed: false };
  }

  // Cmd+P helper writes the real frontmost browser before Raycast activates.
  const hint = readLastBrowserHint();
  if (hint) {
    const hinted =
      findBrowserByBundleId(hint.bundleId) ??
      (hint.bundleId === "net.imput.helium.helper"
        ? findBrowserByBundleId("net.imput.helium")
        : undefined);
    if (hinted && !isBrowserExcluded(hinted.bundleId, prefs)) {
      return {
        frontmost: asApplication(
          hinted.bundleId,
          hint.name || hinted.name,
        ),
        browser: hinted,
        allowed: true,
      };
    }
  }

  const running = runningApplications();
  const byBundle = new Map(running.map((r) => [r.bundleId, r]));
  const picked = pickRunningBrowser(
    running.map((r) => r.bundleId),
    prefs,
  );
  if (picked) {
    const hit = byBundle.get(picked.bundleId);
    return {
      frontmost: asApplication(
        picked.bundleId,
        hit?.name || picked.name,
      ),
      browser: picked,
      allowed: true,
    };
  }

  return { frontmost, browser: null, allowed: false };
}
