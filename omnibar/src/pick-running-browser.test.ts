import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findBrowserByBundleId } from "./browser-catalog";
import { pickRunningBrowser } from "./pick-running-browser";

describe("pickRunningBrowser", () => {
  it("prefers catalog order among running browsers", () => {
    const picked = pickRunningBrowser([
      "app.zen-browser.zen",
      "net.imput.helium",
      "com.apple.Safari",
    ]);
    assert.equal(picked?.id, "safari");
  });

  it("includes Zen when it is the only running browser", () => {
    const picked = pickRunningBrowser(["app.zen-browser.zen"]);
    assert.equal(picked?.bundleId, "app.zen-browser.zen");
    assert.equal(picked?.engine, "gecko");
  });

  it("maps Helium helper to Helium", () => {
    const picked = pickRunningBrowser(["net.imput.helium.helper"]);
    assert.equal(picked?.id, "helium");
  });

  it("honors exclusions", () => {
    const prefs = {
      "exclude_com.apple.Safari": true,
    };
    const picked = pickRunningBrowser(
      ["com.apple.Safari", "app.zen-browser.zen"],
      prefs,
    );
    assert.equal(picked?.id, "zen");
  });
});

describe("Zen catalog entry", () => {
  it("is registered under app.zen-browser.zen", () => {
    const zen = findBrowserByBundleId("app.zen-browser.zen");
    assert.ok(zen);
    assert.equal(zen!.name, "Zen");
    assert.equal(zen!.engine, "gecko");
    assert.equal(zen!.profileSupportPath, "zen");
  });
});
