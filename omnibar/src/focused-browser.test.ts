import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextFromHint } from "./hint-context";
import { parseLastBrowserHint } from "./last-browser";
import {
  GURL_SCRIPT,
  activateFocusedProcessScript,
  rememberFocusedProcess,
  rememberedFocusedPid,
  shouldOpenFocusedProcess,
} from "./focused-browser";

const prefs = { searchEngine: "google" as const, enableSuggestions: true };
const zen = "app.zen-browser.zen";

describe("parseLastBrowserHint", () => {
  it("keeps the process that was focused when Cmd+P fired", () => {
    const hint = parseLastBrowserHint(
      {
        bundleId: zen,
        name: "Zen",
        recordedAt: 1_000,
        pid: 12053,
      },
      1_100,
    );
    assert.equal(hint?.pid, 12053);
    assert.equal(hint?.bundleId, zen);
  });

  it("drops a missing, zero, or stale process id", () => {
    assert.equal(
      parseLastBrowserHint({ bundleId: zen, recordedAt: 1_000, pid: 0 }, 1_100)
        ?.pid,
      undefined,
    );
    assert.equal(
      parseLastBrowserHint({ bundleId: zen, recordedAt: 1_000 }, 1_100)?.pid,
      undefined,
    );
    assert.equal(
      parseLastBrowserHint(
        { bundleId: zen, recordedAt: 1_000, pid: 12053 },
        20_000,
      ),
      undefined,
    );
  });
});

describe("focused Zen process", () => {
  it("opens links in the Zen focused at Cmd+P, not the one launched later", () => {
    rememberFocusedProcess(zen, undefined);
    rememberFocusedProcess(zen, 12053);
    assert.equal(rememberedFocusedPid(zen), 12053);
    assert.equal(shouldOpenFocusedProcess("gecko", 12053), true);
    assert.equal(rememberedFocusedPid("com.apple.Safari"), undefined);
    rememberFocusedProcess("com.apple.Safari", undefined);
    assert.equal(rememberedFocusedPid(zen), undefined);
  });

  it("keeps the focused Zen when a later resolve omits the process id", () => {
    rememberFocusedProcess(zen, 12053);
    rememberFocusedProcess(zen, undefined);
    assert.equal(rememberedFocusedPid(zen), 12053);
    rememberFocusedProcess("com.apple.Safari", undefined);
  });

  it("does not retarget Chrome or Safari by process id", () => {
    assert.equal(shouldOpenFocusedProcess("chromium", 12053), false);
    assert.equal(shouldOpenFocusedProcess("webkit", 12053), false);
    assert.equal(shouldOpenFocusedProcess("gecko", undefined), false);
  });

  it("carries the focused process on the Cmd+P hint context", () => {
    const context = contextFromHint(
      { bundleId: zen, name: "Zen", recordedAt: 1, pid: 12053 },
      prefs,
      () => "/Users/me/Applications/Zen.app",
    );
    assert.equal(context?.focusedPid, 12053);
  });

  it("sends the URL to that process id", () => {
    assert.match(GURL_SCRIPT, /descriptorWithProcessIdentifier:targetPid/);
    assert.match(GURL_SCRIPT, /1196773964/);
    assert.equal(GURL_SCRIPT.includes("96045"), false);
    const script = activateFocusedProcessScript(12053);
    assert.match(script, /unix id is 12053/);
    assert.equal(script.includes("96045"), false);
  });
});
