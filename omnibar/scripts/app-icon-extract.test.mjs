import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldExtractIcon } from "./app-icon-extract.mjs";

describe("shouldExtractIcon", () => {
  it("re-extracts Zen even when a png already exists", () => {
    assert.equal(shouldExtractIcon("zen", true, false), true);
  });

  it("keeps other browser pngs unless a full extract is requested", () => {
    assert.equal(shouldExtractIcon("safari", true, false), false);
    assert.equal(shouldExtractIcon("helium", true, false), false);
    assert.equal(shouldExtractIcon("safari", true, true), true);
  });

  it("extracts an icon that is not on disk yet", () => {
    assert.equal(shouldExtractIcon("chrome", false, false), true);
  });
});
