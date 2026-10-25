import { findCommand } from "./commands";
import type { Tab } from "./classify";
import { formatMarkdownLink, sanitizeUrl, sanitizeUrls } from "./supercopy";

export type ActionEngine = "chromium" | "webkit" | "arc";

export type ActionContext = {
  browserName: string;
  engine: ActionEngine;
};

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export type ActionDeps = {
  runAppleScript: (script: string) => Promise<string>;
  keystroke: (systemEventsScript: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  getActiveTab: () => Promise<Tab | undefined>;
  getOpenTabs: () => Promise<Tab[]>;
};

function tellBrowser(name: string, body: string): string {
  return `tell application "${name}"\n${body}\nend tell`;
}

function chromiumFrontTab(body: string): string {
  return `tell front window\ntell active tab\n${body}\nend tell\nend tell`;
}

function webkitFrontTab(body: string): string {
  return `tell front window\ntell current tab\n${body}\nend tell\nend tell`;
}

async function keychord(
  deps: ActionDeps,
  browserName: string,
  keys: string,
  using: string,
): Promise<void> {
  await deps.keystroke(`
tell application "${browserName}" to activate
delay 0.05
tell application "System Events"
  keystroke "${keys}" using {${using}}
end tell
`);
}

export function createBrowserActions(deps: ActionDeps) {
  return async function runCommand(
    commandId: string,
    ctx: ActionContext,
  ): Promise<ActionResult> {
    const command = findCommand(commandId);
    if (!command) {
      return { ok: false, message: `Unknown command: ${commandId}` };
    }

    try {
      if (command.openUrl) {
        await deps.openUrl(command.openUrl);
        return { ok: true };
      }

      switch (commandId) {
        case "copy-current-url": {
          const tab = await deps.getActiveTab();
          if (!tab?.url) {
            return { ok: false, message: "No active tab URL" };
          }
          await deps.copyText(sanitizeUrl(tab.url));
          return { ok: true, message: "Copied Current URL" };
        }
        case "copy-url-markdown": {
          const tab = await deps.getActiveTab();
          if (!tab?.url) {
            return { ok: false, message: "No active tab URL" };
          }
          await deps.copyText(formatMarkdownLink(tab.title, tab.url));
          return { ok: true, message: "Copied Markdown Link" };
        }
        case "copy-urls": {
          const tabs = await deps.getOpenTabs();
          await deps.copyText(sanitizeUrls(tabs.map((t) => t.url)));
          return { ok: true, message: "Copied URLs" };
        }
        case "new-window":
          await deps.runAppleScript(
            tellBrowser(ctx.browserName, "make new window"),
          );
          return { ok: true };
        case "new-incognito":
          if (ctx.engine === "webkit") {
            await keychord(
              deps,
              ctx.browserName,
              "n",
              "command down, shift down",
            );
          } else {
            await deps.runAppleScript(
              tellBrowser(
                ctx.browserName,
                'make new window with properties {mode:"incognito"}',
              ),
            );
          }
          return { ok: true };
        case "reopen-closed-tab":
          await keychord(
            deps,
            ctx.browserName,
            "t",
            "command down, shift down",
          );
          return { ok: true };
        case "go-back":
          await deps.runAppleScript(
            tellBrowser(
              ctx.browserName,
              ctx.engine === "webkit"
                ? webkitFrontTab("go back")
                : chromiumFrontTab("go back"),
            ),
          );
          return { ok: true };
        case "go-forward":
          await deps.runAppleScript(
            tellBrowser(
              ctx.browserName,
              ctx.engine === "webkit"
                ? webkitFrontTab("go forward")
                : chromiumFrontTab("go forward"),
            ),
          );
          return { ok: true };
        case "close-tab":
          if (ctx.engine === "webkit") {
            await deps.runAppleScript(
              tellBrowser(ctx.browserName, "close current tab of front window"),
            );
          } else {
            await deps.runAppleScript(
              tellBrowser(
                ctx.browserName,
                "tell front window\ndelete (active tab)\nend tell",
              ),
            );
          }
          return { ok: true };
        case "minimize-window":
          await deps.runAppleScript(
            tellBrowser(
              ctx.browserName,
              "set miniaturized of front window to true",
            ),
          );
          return { ok: true };
        case "close-window":
          await deps.runAppleScript(
            tellBrowser(ctx.browserName, "close front window"),
          );
          return { ok: true };
        case "quit-browser":
          await deps.runAppleScript(tellBrowser(ctx.browserName, "quit"));
          return { ok: true };
        case "find-in-page":
          await keychord(deps, ctx.browserName, "f", "command down");
          return { ok: true };
        case "duplicate-tab": {
          const tab = await deps.getActiveTab();
          if (!tab?.url) {
            return { ok: false, message: "No active tab to duplicate" };
          }
          await deps.openUrl(tab.url);
          return { ok: true };
        }
        case "reload":
          await deps.runAppleScript(
            tellBrowser(
              ctx.browserName,
              ctx.engine === "webkit"
                ? webkitFrontTab("reload")
                : chromiumFrontTab("reload"),
            ),
          );
          return { ok: true };
        case "zoom-in":
          await keychord(deps, ctx.browserName, "=", "command down");
          return { ok: true };
        case "zoom-out":
          await keychord(deps, ctx.browserName, "-", "command down");
          return { ok: true };
        case "zoom-actual":
          await keychord(deps, ctx.browserName, "0", "command down");
          return { ok: true };
        case "developer-tools":
          await keychord(
            deps,
            ctx.browserName,
            "i",
            "command down, option down",
          );
          return { ok: true };
        case "full-screen":
          await keychord(
            deps,
            ctx.browserName,
            "f",
            "command down, control down",
          );
          return { ok: true };
        case "print":
          await keychord(deps, ctx.browserName, "p", "command down");
          return { ok: true };
        case "save-page":
          await keychord(deps, ctx.browserName, "s", "command down");
          return { ok: true };
        case "undo":
          await keychord(deps, ctx.browserName, "z", "command down");
          return { ok: true };
        case "redo":
          await keychord(
            deps,
            ctx.browserName,
            "z",
            "command down, shift down",
          );
          return { ok: true };
        default:
          return {
            ok: false,
            message: `Command not implemented: ${command.title}`,
          };
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
