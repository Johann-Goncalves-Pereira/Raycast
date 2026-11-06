import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  freshStamp,
  shouldApplyBrowserHint,
  shouldRunSubmit,
  shouldRunTab,
} from "./last-browser";

describe("freshStamp", () => {
  it("does not run a stamp left on disk from before Omnibar opened", () => {
    assert.deepEqual(freshStamp(1_000, undefined, 500), {
      seen: 500,
      run: false,
    });
    assert.deepEqual(freshStamp(1_000, 500, 500), { seen: 500, run: false });
  });

  it("runs a Cmd+Enter that happens after the window is open, once", () => {
    assert.deepEqual(freshStamp(1_000, 500, 1_100), {
      seen: 1_100,
      run: true,
    });
    assert.deepEqual(freshStamp(1_000, 1_100, 1_100), {
      seen: 1_100,
      run: false,
    });
  });
});

describe("shouldRunSubmit", () => {
  it("runs a new Cmd+Enter once when there is a query", () => {
    assert.equal(shouldRunSubmit(undefined, 10, "cats"), true);
    assert.equal(shouldRunSubmit(10, 10, "cats"), false);
    assert.equal(shouldRunSubmit(10, 11, "  "), false);
  });
});

describe("shouldRunTab", () => {
  it("runs a new Tab once", () => {
    assert.equal(shouldRunTab(undefined, 10), true);
    assert.equal(shouldRunTab(10, 10), false);
    assert.equal(shouldRunTab(10, 11), true);
    assert.equal(shouldRunTab(10, undefined), false);
  });
});

describe("shouldApplyBrowserHint", () => {
  it("applies a hint for a different browser or a newer Cmd+P", () => {
    const current = { bundleId: "net.imput.helium", recordedAt: 10 };
    assert.equal(
      shouldApplyBrowserHint(current, {
        bundleId: "com.apple.Safari",
        recordedAt: 11,
      }),
      true,
    );
    assert.equal(
      shouldApplyBrowserHint(current, {
        bundleId: "net.imput.helium",
        recordedAt: 12,
      }),
      true,
    );
    assert.equal(shouldApplyBrowserHint(undefined, current), true);
  });

  it("ignores the hint the mounted window already applied", () => {
    const current = { bundleId: "com.apple.Safari", recordedAt: 10 };
    assert.equal(shouldApplyBrowserHint(current, current), false);
    assert.equal(shouldApplyBrowserHint(current, undefined), false);
  });
});
