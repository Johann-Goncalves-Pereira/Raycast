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
});
