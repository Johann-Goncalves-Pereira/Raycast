import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldActivateBrowser } from "./close-focus";

describe("shouldActivateBrowser", () => {
  it("returns focus to the browser after Omnibar closes itself", () => {
    assert.equal(shouldActivateBrowser("escape"), true);
    assert.equal(shouldActivateBrowser("empty-delete"), true);
    assert.equal(shouldActivateBrowser("submit"), true);
    assert.equal(shouldActivateBrowser("open"), true);
  });

  it("does not steal focus when a trackpad gesture dismisses the window", () => {
    assert.equal(shouldActivateBrowser("unmount"), false);
  });
});
