import {
  Application,
  getApplications,
  getFrontmostApplication,
} from "@raycast/api";
import { fallbackAppPath, preferInstalledAppPath } from "./app-icon";
import { browserForOmnibarOpen } from "./pick-running-browser";
import { contextFromHint } from "./hint-context";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { type BrowserDefinition } from "./browser-catalog";
import { ExtensionPreferences } from "./browsers";
import { readLastBrowserHint } from "./last-browser";

const RAYCAST_BUNDLE_IDS = new Set([
  "com.raycast.macos",
  "com.raycast.macos.debug",
]);

export type OmnibarBrowserContext = {
  frontmost: Application;
  browser: BrowserDefinition;
  allowed: true;
  /** Zen process that was focused when Cmd+P fired. */
  focusedPid?: number;
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

async function withInstalledIcon(app: Application): Promise<Application> {
  if (app.path) return app;
  try {
    const installed = await getApplications();
    const resolved = preferInstalledAppPath(app, installed);
    const path =
      resolved.path ||
      fallbackAppPath(resolved.bundleId, homedir(), existsSync);
    return { ...app, path, name: resolved.name };
  } catch {
    return app;
  }
}

/**
 * Deeplink/hotkey often focuses Raycast first. Prefer the true frontmost browser,
 * otherwise the Cmd+P hint, then the first running allowed browser.
 */
export async function resolveOmnibarContext(
  prefs?: ExtensionPreferences,
): Promise<OmnibarContext> {
  const hint = readLastBrowserHint();
  const hinted = contextFromHint(hint, prefs, (bundleId) =>
    fallbackAppPath(bundleId, homedir(), existsSync),
  );
  if (hinted?.allowed && hinted.frontmost.path) return hinted;

  const frontmost = await getFrontmostApplication();
  const frontBundle = frontmost.bundleId ?? "";
  const running = runningApplications();
  const browser = browserForOmnibarOpen({
    frontBundle,
    hintBundleId: hint?.bundleId,
    runningBundleIds: running.map((item) => item.bundleId),
    prefs,
  });
  if (!browser) return { frontmost, browser: null, allowed: false };

  const focusedPid = hint?.bundleId === browser.bundleId ? hint.pid : undefined;
  if (browser.bundleId === frontBundle) {
    return {
      frontmost: await withInstalledIcon(frontmost),
      browser,
      allowed: true,
      focusedPid,
    };
  }

  const hit = running.find((item) => item.bundleId === browser.bundleId);
  return {
    frontmost: await withInstalledIcon(
      asApplication(browser.bundleId, hint?.name || hit?.name || browser.name),
    ),
    browser,
    allowed: true,
    focusedPid,
  };
}
