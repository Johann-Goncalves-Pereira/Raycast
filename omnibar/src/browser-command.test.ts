import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROWSER_CATALOG,
  omnibarCommandName,
  omnibarDeeplink,
} from "./browser-catalog";

describe("omnibarCommandName", () => {
  it("opens Zen, Helium, Safari, and Chrome with their own icon command", () => {
    assert.equal(omnibarCommandName("app.zen-browser.zen"), "cmd-zen");
    assert.equal(omnibarCommandName("net.imput.helium"), "cmd-helium");
    assert.equal(omnibarCommandName("com.apple.Safari"), "cmd-safari");
    assert.equal(omnibarCommandName("com.google.Chrome"), "cmd-chrome");
    assert.ok(BROWSER_CATALOG.some((browser) => browser.id === "zen"));
  });

  it("uses the Helium icon command for the Helium helper", () => {
    assert.equal(omnibarCommandName("net.imput.helium.helper"), "cmd-helium");
  });

  it("falls back when that browser has no icon command", () => {
    assert.equal(omnibarCommandName(undefined), "search");
    assert.equal(omnibarCommandName("com.brave.Browser"), "search");
    assert.equal(
      omnibarDeeplink("app.zen-browser.zen"),
      "raycast://extensions/johann_goncalves_pereira/omnibar/cmd-zen",
    );
  });
});
