import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldBlockList } from "./list-loading";

describe("shouldBlockList", () => {
  it("does not block a fresh Cmd+P hint when history is already cached", () => {
    assert.equal(
      shouldBlockList({
        hasHint: true,
        contextReady: false,
        hasCachedRows: true,
        listsLoading: true,
      }),
      false,
    );
  });

  it("does not block a fresh hint while history is still loading", () => {
    assert.equal(
      shouldBlockList({
        hasHint: true,
        contextReady: false,
        hasCachedRows: false,
        listsLoading: true,
      }),
      false,
    );
  });

  it("shows the spinner on a cold open with no hint", () => {
    assert.equal(
      shouldBlockList({
        hasHint: false,
        contextReady: false,
        hasCachedRows: false,
        listsLoading: true,
      }),
      true,
    );
  });

  it("stops the spinner once cached rows are visible", () => {
    assert.equal(
      shouldBlockList({
        hasHint: false,
        contextReady: true,
        hasCachedRows: true,
        listsLoading: true,
      }),
      false,
    );
  });
});
