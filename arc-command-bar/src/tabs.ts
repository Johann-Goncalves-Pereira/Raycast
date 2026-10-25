import { Application, open } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { BrowserDefinition } from "./browsers";
import { TTL, cacheKey, readFresh, readStale, writeCache } from "./cache";
import { Tab, domainFromUrl } from "./classify";

const scriptListTabs = (browserName: string) => `
tell application "${browserName}"
  if running then
    set output to ""
    repeat with aWindow in every window
      set chromiumTabIndex to 0
      repeat with aTab in every tab of aWindow
        set chromiumTabIndex to chromiumTabIndex + 1
        try
          set tabName to name of aTab
        on error
          set tabName to title of aTab
        end try
        set tabUrl to URL of aTab
        set windowId to id of aWindow
        try
          set tabIndex to index of aTab
        on error
          set tabIndex to chromiumTabIndex
        end try
        set tabInfo to tabName & "\\n" & tabUrl & "\\n" & windowId & "\\n" & tabIndex & "\\n\\n"
        set output to output & tabInfo
      end repeat
    end repeat
    return output
  else
    return ""
  end if
end tell
`;

function parseTabs(raw: string | undefined): Tab[] {
  if (!raw) return [];
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [title, url, windowId, tabId] = block.split("\n");
      return {
        title: title || url || "Untitled",
        url: url || "",
        domain: domainFromUrl(url || ""),
        windowId: windowId || "0",
        tabId: tabId || "1",
      };
    })
    .filter((tab) => tab.url.length > 0);
}

/** Synchronous stale seed for Raycast List first paint. */
export function peekCachedTabs(bundleId: string): Tab[] | undefined {
  return readStale<Tab[]>(cacheKey("tabs", bundleId));
}

export async function getTabsForBrowser(app: Application): Promise<Tab[]> {
  const key = cacheKey("tabs", app.bundleId ?? app.name);
  const fresh = readFresh<Tab[]>(key, TTL.tabs);
  if (fresh) return fresh;

  const stale = readStale<Tab[]>(key);
  try {
    const raw = await runAppleScript(scriptListTabs(app.name));
    const tabs = parseTabs(raw);
    writeCache(key, tabs);
    return tabs;
  } catch (error) {
    console.error(`Failed to list tabs for ${app.name}`, error);
    return stale ?? [];
  }
}

const scriptJumpWebKit = (browser: string, tab: Tab) => `
tell application "${browser}"
  activate
  set _wnd to first window where id is ${tab.windowId}
  set index of _wnd to 1
  set current tab of _wnd to tab ${tab.tabId} of _wnd
end tell
`;

const scriptJumpChromium = (browser: string, tab: Tab) => `
tell application "${browser}"
  activate
  set _wnd to first window where id is ${tab.windowId}
  set index of _wnd to 1
  set active tab index of _wnd to ${tab.tabId}
end tell
`;

const scriptJumpArcByUrl = (browser: string, tab: Tab) => `
tell application "${browser}"
  if (count of windows) is 0 then
    make new window
  end if
  set foundTab to false
  set targetUrl to "${tab.url.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"
  repeat with aWindow in every window
    repeat with aTab in every tab of aWindow
      try
        if URL of aTab is equal to targetUrl then
          tell aTab to select
          set foundTab to true
          exit repeat
        end if
      end try
    end repeat
    if foundTab then exit repeat
  end repeat
  if foundTab is false then
    error "Tab not found"
  end if
  activate
end tell
`;

/** Best-effort active tab: first window's active/current tab via AppleScript. */
export async function getActiveTabForBrowser(
  app: Application,
  browser: BrowserDefinition,
): Promise<Tab | undefined> {
  const tabs = await getTabsForBrowser(app);
  if (tabs.length === 0) return undefined;
  try {
    const script =
      browser.engine === "webkit"
        ? `
tell application "${app.name}"
  if (count of windows) is 0 then return ""
  set t to current tab of front window
  return (name of t) & "\\n" & (URL of t) & "\\n" & (id of front window) & "\\n" & (index of t)
end tell`
        : `
tell application "${app.name}"
  if (count of windows) is 0 then return ""
  set t to active tab of front window
  return (title of t) & "\\n" & (URL of t) & "\\n" & (id of front window) & "\\n" & (active tab index of front window)
end tell`;
    const raw = await runAppleScript(script);
    const parsed = parseTabs(raw ? `${raw}\n\n` : "");
    if (parsed[0]) return parsed[0];
  } catch {
    // fall through
  }
  return tabs[0];
}

export async function jumpToTab(
  app: Application,
  browser: BrowserDefinition,
  tab: Tab,
): Promise<void> {
  try {
    if (browser.engine === "arc") {
      await runAppleScript(scriptJumpArcByUrl(app.name, tab));
      return;
    }
    if (browser.engine === "webkit") {
      await runAppleScript(scriptJumpWebKit(app.name, tab));
      return;
    }
    await runAppleScript(scriptJumpChromium(app.name, tab));
  } catch (error) {
    console.error(
      `Failed to jump to tab in ${app.name}, falling back to open()`,
      error,
    );
    await open(tab.url, app);
  }
}
