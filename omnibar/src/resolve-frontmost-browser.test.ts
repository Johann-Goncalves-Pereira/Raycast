import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextFromHint } from "./hint-context";
import { browserForOmnibarOpen } from "./pick-running-browser";

const prefs = {
  searchEngine: "google",
  enableSuggestions: true,
};

describe("browserForOmnibarOpen", () => {
  it("keeps the browser that is actually in front", () => {
    const browser = browserForOmnibarOpen({
      frontBundle: "net.imput.helium",
      hintBundleId: "com.apple.Safari",
      runningBundleIds: ["com.apple.Safari", "net.imput.helium"],
      prefs,
    });
    assert.equal(browser?.bundleId, "net.imput.helium");
  });

  it("uses the Cmd+P hint when Finder or Raycast is in front", () => {
    const fromFinder = browserForOmnibarOpen({
      frontBundle: "com.apple.finder",
      hintBundleId: "com.apple.Safari",
      runningBundleIds: ["net.imput.helium"],
      prefs,
    });
    assert.equal(fromFinder?.bundleId, "com.apple.Safari");

    const fromRaycast = browserForOmnibarOpen({
      frontBundle: "com.raycast.macos",
      hintBundleId: "app.zen-browser.zen",
      runningBundleIds: [],
      prefs,
    });
    assert.equal(fromRaycast?.bundleId, "app.zen-browser.zen");
  });

  it("paints Zen from a fresh hint without a process list", () => {
    const context = contextFromHint(
      {
        bundleId: "app.zen-browser.zen",
        name: "Zen",
        recordedAt: 1,
      },
      prefs,
      () => "/Users/me/Applications/Zen.app",
    );
    assert.equal(context?.allowed, true);
    if (!context?.allowed) return;
    assert.equal(context.browser.bundleId, "app.zen-browser.zen");
    assert.equal(context.frontmost.path, "/Users/me/Applications/Zen.app");
  });

  it("does not paint an unknown hint", () => {
    assert.equal(
      contextFromHint(
        { bundleId: "com.example.unknown", recordedAt: 1 },
        prefs,
        () => "",
      ),
      undefined,
    );
  });

  it("maps the Helium helper to Helium", () => {
    const browser = browserForOmnibarOpen({
      frontBundle: "com.raycast.macos",
      hintBundleId: "net.imput.helium.helper",
      runningBundleIds: [],
      prefs,
    });
    assert.equal(browser?.bundleId, "net.imput.helium");
  });
});
