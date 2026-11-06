import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMAND_CATALOG,
  SUGGESTED_COMMAND_IDS,
  filterCommands,
  findCommand,
} from "./commands";

describe("COMMAND_CATALOG", () => {
  it("includes core portable Arc actions", () => {
    const ids = new Set(COMMAND_CATALOG.map((c) => c.id));
    for (const id of [
      "new-window",
      "new-incognito",
      "reopen-closed-tab",
      "copy-current-url",
      "copy-urls",
      "copy-url-markdown",
      "go-back",
      "go-forward",
      "downloads",
      "close-tab",
      "reload",
      "zoom-in",
      "zoom-out",
      "zoom-actual",
      "developer-tools",
      "view-history",
      "preferences",
      "manage-extensions",
      "add-extension",
      "new-google-doc",
      "new-google-sheet",
      "new-notion-page",
      "duplicate-tab",
    ]) {
      assert.ok(ids.has(id), `missing command ${id}`);
    }
  });

  it("exposes a curated empty-state suggestion list", () => {
    assert.ok(SUGGESTED_COMMAND_IDS.length >= 5);
    for (const id of SUGGESTED_COMMAND_IDS) {
      assert.ok(findCommand(id), `suggested ${id} not in catalog`);
    }
  });
});

describe("filterCommands", () => {
  it("fuzzy-matches title and keywords", () => {
    const hits = filterCommands("reload");
    assert.ok(hits.some((c) => c.id === "reload"));
  });

  it("returns suggested commands when the filter is empty", () => {
    const hits = filterCommands("");
    assert.deepEqual(
      hits.map((c) => c.id),
      SUGGESTED_COMMAND_IDS,
    );
  });

  it("matches SaaS deep-link commands", () => {
    const hits = filterCommands("google doc");
    assert.ok(hits.some((c) => c.id === "new-google-doc"));
  });

  it("ranks New Folder ahead of New Window for Zen", () => {
    const hits = filterCommands("new fold", "gecko");
    assert.equal(hits[0]?.id, "new-folder");
    assert.ok(hits.some((command) => command.id === "new-window"));
  });

  it("hides Zen folder commands on WebKit and Chromium", () => {
    assert.equal(
      filterCommands("new fold", "webkit").some(
        (command) => command.id === "new-folder",
      ),
      false,
    );
    assert.equal(
      filterCommands("new fold", "chromium").some(
        (command) => command.id === "new-folder",
      ),
      false,
    );
  });

  it("keeps chrome:// pages off Safari and the web store off Zen", () => {
    const safari = [
      ...filterCommands("", "webkit"),
      ...filterCommands("history", "webkit"),
      ...filterCommands("settings", "webkit"),
      ...filterCommands("downloads", "webkit"),
    ];
    assert.ok(safari.every((command) => !command.openUrl?.startsWith("chrome:")));
    assert.equal(
      filterCommands("extension", "gecko").some(
        (command) => command.id === "add-extension",
      ),
      false,
    );
  });

  it("keeps Chromium incognito, downloads, extensions, and task manager", () => {
    const ids = new Set([
      ...filterCommands("incognito", "chromium").map((command) => command.id),
      ...filterCommands("download", "chromium").map((command) => command.id),
      ...filterCommands("extensions", "chromium").map((command) => command.id),
      ...filterCommands("task manager", "chromium").map((command) => command.id),
    ]);
    for (const id of [
      "new-incognito",
      "downloads",
      "manage-extensions",
      "task-manager",
    ]) {
      assert.ok(ids.has(id), `missing ${id}`);
    }
  });
});
