import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pinnedToDevelopmentSection,
  shouldPublishBuild,
  shouldRebuildHotkey,
  shouldReloadAskBridge,
  shouldStopDevelopWatcher,
} from "./update-plan.mjs";

describe("shouldRebuildHotkey", () => {
  it("skips a compile when the binary is newer than the Swift source", () => {
    assert.equal(
      shouldRebuildHotkey({
        full: false,
        sourceMtimeMs: 10,
        binaryMtimeMs: 20,
      }),
      false,
    );
  });

  it("recompiles when the source changed or --full is set", () => {
    assert.equal(
      shouldRebuildHotkey({
        full: false,
        sourceMtimeMs: 30,
        binaryMtimeMs: 20,
      }),
      true,
    );
    assert.equal(
      shouldRebuildHotkey({
        full: true,
        sourceMtimeMs: 10,
        binaryMtimeMs: 20,
      }),
      true,
    );
    assert.equal(
      shouldRebuildHotkey({
        full: false,
        sourceMtimeMs: 10,
        binaryMtimeMs: null,
      }),
      true,
    );
  });
});

describe("shouldReloadAskBridge", () => {
  it("leaves a healthy bridge alone when the server and plist are current", () => {
    assert.equal(
      shouldReloadAskBridge({
        full: false,
        healthy: true,
        plistMatches: true,
        serverMtimeMs: 10,
        plistMtimeMs: 20,
      }),
      false,
    );
  });

  it("reloads when health, the plist, or the server is stale", () => {
    assert.equal(
      shouldReloadAskBridge({
        full: false,
        healthy: false,
        plistMatches: true,
        serverMtimeMs: 10,
        plistMtimeMs: 20,
      }),
      true,
    );
    assert.equal(
      shouldReloadAskBridge({
        full: false,
        healthy: true,
        plistMatches: false,
        serverMtimeMs: 10,
        plistMtimeMs: 20,
      }),
      true,
    );
    assert.equal(
      shouldReloadAskBridge({
        full: false,
        healthy: true,
        plistMatches: true,
        serverMtimeMs: 30,
        plistMtimeMs: 20,
      }),
      true,
    );
  });
});

describe("pinnedToDevelopmentSection", () => {
  it("pins a live development build into the empty Raycast bar", () => {
    assert.equal(pinnedToDevelopmentSection("success"), true);
    assert.equal(pinnedToDevelopmentSection("failure"), true);
  });

  it("leaves a stopped build off the empty bar", () => {
    assert.equal(pinnedToDevelopmentSection("unknown"), false);
    assert.equal(pinnedToDevelopmentSection(undefined), false);
  });
});

describe("shouldStopDevelopWatcher", () => {
  it("unloads a running watcher or a login plist", () => {
    assert.equal(
      shouldStopDevelopWatcher({ running: true, plistInstalled: false }),
      true,
    );
    assert.equal(
      shouldStopDevelopWatcher({ running: false, plistInstalled: true }),
      true,
    );
  });

  it("does nothing when the watcher is already gone", () => {
    assert.equal(
      shouldStopDevelopWatcher({ running: false, plistInstalled: false }),
      false,
    );
  });
});

describe("shouldPublishBuild", () => {
  it("skips a publish when the installed build is newer than the source", () => {
    assert.equal(
      shouldPublishBuild({
        full: false,
        sourceMtimeMs: 10,
        buildMtimeMs: 20,
      }),
      false,
    );
  });

  it("publishes when the source changed, the build is missing, or --full is set", () => {
    assert.equal(
      shouldPublishBuild({
        full: false,
        sourceMtimeMs: 30,
        buildMtimeMs: 20,
      }),
      true,
    );
    assert.equal(
      shouldPublishBuild({
        full: false,
        sourceMtimeMs: 10,
        buildMtimeMs: null,
      }),
      true,
    );
    assert.equal(
      shouldPublishBuild({
        full: true,
        sourceMtimeMs: 10,
        buildMtimeMs: 20,
      }),
      true,
    );
  });
});
