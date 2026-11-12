import { execFile } from "node:child_process";
import {
  Application,
  getApplications,
  getPreferenceValues,
  open,
} from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { preferInstalledAppPath } from "./app-icon";
import { findBrowserByBundleId, type BrowserEngine } from "./browser-catalog";
import { ExtensionPreferences } from "./browsers";
import {
  GURL_SCRIPT,
  activateFocusedProcessScript,
  rememberedFocusedPid,
  shouldOpenFocusedProcess,
} from "./focused-browser";
import { buildSearchUrl, classifyInput } from "./classify";
import {
  exactSearchUrl,
  newTabOpenSucceeded,
  newTabScript,
  type FallbackEngine,
} from "./exact-search";

function focusedGeckoPid(bundleId: string | undefined): number | undefined {
  const browser = bundleId ? findBrowserByBundleId(bundleId) : undefined;
  const pid = rememberedFocusedPid(browser?.bundleId ?? bundleId);
  if (!shouldOpenFocusedProcess(browser?.engine, pid)) return undefined;
  return pid;
}

function runOsascript(
  script: string,
  args: readonly string[] = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/osascript", ["-e", script, "--", ...args], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function openInFocusedProcess(pid: number, url: string): Promise<void> {
  await runOsascript(GURL_SCRIPT, [String(pid), url]);
}

export async function openInBrowser(
  app: Application,
  target: string,
): Promise<void> {
  const resolved = (await applicationWithPath(app)) ?? app;
  const pid = focusedGeckoPid(resolved.bundleId ?? app.bundleId);
  if (pid !== undefined) {
    try {
      await openInFocusedProcess(pid, target);
      return;
    } catch {
      // The focused process can exit before Enter. Fall through.
    }
  }
  try {
    await openWithLaunchServices(resolved, target);
    return;
  } catch {
    await open(target, resolved);
  }
}

export async function openQueryInBrowser(
  app: Application,
  query: string,
): Promise<void> {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const classified = classifyInput(query);
  if (classified.kind === "url") {
    await openInBrowser(app, classified.value);
    return;
  }
  const engine =
    (prefs.searchEngine as "google" | "duckduckgo" | "bing") || "google";
  await openInBrowser(app, buildSearchUrl(classified.value, engine));
}

/** Bring the browser forward. Used only after Omnibar closes itself. */
export function activateApplication(app: {
  name: string;
  path?: string;
  bundleId?: string;
}): Promise<void> {
  const pid = focusedGeckoPid(app.bundleId);
  if (pid !== undefined) {
    return runOsascript(activateFocusedProcessScript(pid)).catch(
      () => undefined,
    );
  }
  const target = app.path || app.name;
  if (!target) return Promise.resolve();
  return new Promise((resolve) => {
    execFile("/usr/bin/open", ["-a", target], () => resolve());
  });
}

function openWithLaunchServices(app: Application, url: string): Promise<void> {
  const args = app.path ? ["-a", app.path, url] : ["-a", app.name, url];
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/open", args, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function applicationWithPath(
  app: Application,
): Promise<Application | undefined> {
  if (app.path) return app;
  try {
    const installed = await getApplications();
    const resolved = preferInstalledAppPath(app, installed);
    if (!resolved.path) return undefined;
    return { ...app, path: resolved.path, name: resolved.name || app.name };
  } catch {
    return undefined;
  }
}

/** Open the typed query in a new browser tab via that browser's default engine. */
export async function openExactSearchInNewTab(input: {
  app: Application;
  browserName: string;
  engine: BrowserEngine;
  query: string;
  template: string | undefined;
  fallback: FallbackEngine;
}): Promise<boolean> {
  const url = exactSearchUrl(input.query, input.template, input.fallback);
  const focusedPid = focusedGeckoPid(input.app.bundleId);
  if (focusedPid !== undefined) {
    try {
      await openInFocusedProcess(focusedPid, url);
      return true;
    } catch {
      // Fall through to the browser's own scripting dictionary.
    }
  }
  const script = newTabScript(input.browserName, input.engine, url);
  let scriptOk = false;
  if (script) {
    try {
      await runAppleScript(script);
      scriptOk = true;
    } catch {
      scriptOk = false;
    }
  }
  let fallbackOk = false;
  if (!scriptOk) {
    const target = await applicationWithPath(input.app);
    if (target) {
      try {
        await openWithLaunchServices(target, url);
        fallbackOk = true;
      } catch {
        try {
          await openInBrowser(target, url);
          fallbackOk = true;
        } catch {
          fallbackOk = false;
        }
      }
    }
  }
  return newTabOpenSucceeded(scriptOk, fallbackOk);
}
