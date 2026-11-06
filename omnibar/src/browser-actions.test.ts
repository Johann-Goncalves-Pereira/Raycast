import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBrowserActions,
  type ActionDeps,
  type ActionResult,
} from "./browser-actions";
import type { Tab } from "./classify";

function mockDeps(overrides: Partial<ActionDeps> = {}): ActionDeps & {
  scripts: string[];
  clipboard: string[];
  opened: string[];
} {
  const scripts: string[] = [];
  const clipboard: string[] = [];
  const opened: string[] = [];
  return {
    scripts,
    clipboard,
    opened,
    runAppleScript: async (script: string) => {
      scripts.push(script);
      return "";
    },
    copyText: async (text: string) => {
      clipboard.push(text);
    },
    openUrl: async (url: string) => {
      opened.push(url);
    },
    keystroke: async (script: string) => {
      scripts.push(script);
    },
    getActiveTab: async () =>
      ({
        title: "Example",
        url: "https://example.com/?utm_source=x",
        domain: "example.com",
        windowId: "1",
        tabId: "1",
      }) satisfies Tab,
    getOpenTabs: async () =>
      [
        {
          title: "A",
          url: "https://a.test/?fbclid=1",
          domain: "a.test",
          windowId: "1",
          tabId: "1",
        },
        {
          title: "B",
          url: "https://b.test/",
          domain: "b.test",
          windowId: "1",
          tabId: "2",
        },
      ] satisfies Tab[],
    ...overrides,
  };
}

describe("createBrowserActions", () => {
  it("copies a sanitized current URL", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    const result: ActionResult = await run("copy-current-url", {
      browserName: "Google Chrome",
      engine: "chromium",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(deps.clipboard, ["https://example.com/"]);
  });

  it("copies markdown with sanitized URL", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    await run("copy-url-markdown", {
      browserName: "Google Chrome",
      engine: "chromium",
    });
    assert.deepEqual(deps.clipboard, ["[Example](https://example.com/)"]);
  });

  it("copies all open tab URLs sanitized", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    await run("copy-urls", {
      browserName: "Google Chrome",
      engine: "chromium",
    });
    assert.deepEqual(deps.clipboard, ["https://a.test/\nhttps://b.test/"]);
  });

  it("opens deep-link / chrome:// commands via openUrl", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    await run("new-google-doc", {
      browserName: "Google Chrome",
      engine: "chromium",
    });
    await run("preferences", {
      browserName: "Google Chrome",
      engine: "chromium",
    });
    assert.deepEqual(deps.opened, ["https://docs.new", "chrome://settings/"]);
  });

  it("reloads via AppleScript for chromium", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    await run("reload", {
      browserName: "Google Chrome",
      engine: "chromium",
    });
    assert.ok(
      deps.scripts.some(
        (s) => s.includes("reload") && s.includes("Google Chrome"),
      ),
    );
  });

  it("clicks Zen's File menu for New Folder", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    const result = await run("new-folder", {
      browserName: "Zen",
      engine: "gecko",
    });
    assert.equal(result.ok, true);
    assert.ok(
      deps.scripts.some(
        (script) =>
          script.includes("New Folder") &&
          script.includes('menu "File"') &&
          script.includes("Zen"),
      ),
    );
  });

  it("opens Zen preferences on about:preferences", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    await run("preferences-gecko", {
      browserName: "Zen",
      engine: "gecko",
    });
    assert.deepEqual(deps.opened, ["about:preferences"]);
  });

  it("returns an error for unknown commands", async () => {
    const deps = mockDeps();
    const run = createBrowserActions(deps);
    const result = await run("not-real", {
      browserName: "Safari",
      engine: "webkit",
    });
    assert.equal(result.ok, false);
  });
});
