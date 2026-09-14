import { Application, open } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { BrowserDefinition } from "./browsers";
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

export async function getTabsForBrowser(app: Application): Promise<Tab[]> {
  try {
    const raw = await runAppleScript(scriptListTabs(app.name));
    return parseTabs(raw);
  } catch (error) {
    console.error(`Failed to list tabs for ${app.name}`, error);
    return [];
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
