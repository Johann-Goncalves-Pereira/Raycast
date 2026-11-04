import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MRU_TAB_LIMIT,
  NEW_SEARCH_ITEM_ID,
  SCOPED_SEARCH_ITEM_ID,
  commandItemId,
  firstActionItemId,
  isActionScopeQuery,
  mruTabs,
  parseQueryScope,
  sectionsForQuery,
  selectionAfterType,
  tabItemId,
  tabJumpTarget,
} from "./result-order";

describe("parseQueryScope / isActionScopeQuery", () => {
  it("detects slash-space as commands-only scope", () => {
    assert.equal(isActionScopeQuery("/ reload"), true);
    assert.equal(isActionScopeQuery("/  "), true);
    assert.deepEqual(parseQueryScope("/ reload"), {
      mode: "commands",
      filterQuery: "reload",
    });
  });

  it("treats plain queries as unified", () => {
    assert.equal(isActionScopeQuery("/reload"), false);
    assert.equal(isActionScopeQuery("reload"), false);
    assert.deepEqual(parseQueryScope("github"), {
      mode: "unified",
      filterQuery: "github",
    });
  });
});

describe("sectionsForQuery", () => {
  it("puts matching tabs first while typing, then search stream", () => {
    assert.deepEqual(sectionsForQuery("raycast"), [
      "actions",
      "answers",
      "search",
      "history",
      "bookmarks",
      "commands",
    ]);
  });

  it("shows MRU tabs, commands, history, bookmarks when empty", () => {
    assert.deepEqual(sectionsForQuery("   "), [
      "actions",
      "commands",
      "history",
      "bookmarks",
    ]);
  });

  it("scopes exclusively to commands for / queries", () => {
    assert.deepEqual(sectionsForQuery("/ pin"), ["commands"]);
  });
});

describe("mruTabs", () => {
  it(`caps empty-state tabs at ${MRU_TAB_LIMIT}`, () => {
    const tabs = Array.from({ length: 8 }, (_, i) => ({
      windowId: "1",
      tabId: String(i + 1),
      url: `https://example.com/${i}`,
    }));
    assert.equal(mruTabs(tabs).length, MRU_TAB_LIMIT);
    assert.equal(mruTabs(tabs)[0].tabId, "1");
  });
});

describe("selectionAfterType", () => {
  const tab = { windowId: "1", tabId: "2", url: "https://github.com" };

  it("selects Switch to Tab when an open tab matches", () => {
    assert.equal(
      selectionAfterType({
        query: "github",
        scoped: false,
        matchingTabs: [tab],
      }),
      tabItemId(tab),
    );
  });

  it("falls back to clean search when no tab matches", () => {
    assert.equal(
      selectionAfterType({
        query: "docs",
        scoped: false,
        matchingTabs: [],
      }),
      NEW_SEARCH_ITEM_ID,
    );
  });

  it("selects the scoped search while a site search has a query", () => {
    assert.equal(
      selectionAfterType({
        query: "cats",
        scoped: true,
        matchingTabs: [tab],
      }),
      SCOPED_SEARCH_ITEM_ID,
    );
  });

  it("selects the first command under / scope", () => {
    assert.equal(
      selectionAfterType({
        query: "/ reload",
        scoped: false,
        matchingTabs: [],
        commandIds: ["reload"],
      }),
      commandItemId("reload"),
    );
  });

  it("selects the first MRU tab when nothing has been typed", () => {
    assert.equal(
      selectionAfterType({
        query: "",
        scoped: false,
        matchingTabs: [tab],
      }),
      tabItemId(tab),
    );
  });
});

describe("tabJumpTarget", () => {
  it("jumps to the site action before a matching tab", () => {
    assert.equal(
      tabJumpTarget({
        query: "you",
        siteIds: ["youtube"],
        tabs: [{ windowId: "1", tabId: "2", url: "https://example.com" }],
        extensionIds: ["ext-1"],
      }),
      "site-youtube",
    );
  });

  it("jumps to the first matching tab when no site action matches", () => {
    assert.equal(
      tabJumpTarget({
        query: "example",
        siteIds: [],
        tabs: [{ windowId: "1", tabId: "2", url: "https://example.com" }],
      }),
      "tab-1-2-https://example.com",
    );
  });

  it("jumps to an extension when that is the only action", () => {
    assert.equal(
      tabJumpTarget({
        query: "ext",
        siteIds: [],
        tabs: [],
        extensionIds: ["dark-reader"],
      }),
      "ext-dark-reader",
    );
  });

  it("jumps to a command when sites/tabs/extensions are empty", () => {
    assert.equal(
      tabJumpTarget({
        query: "reload",
        siteIds: [],
        tabs: [],
        commandIds: ["reload"],
      }),
      commandItemId("reload"),
    );
  });

  it("does not jump under / scope or empty query", () => {
    assert.equal(
      tabJumpTarget({
        query: "/ reload",
        siteIds: ["youtube"],
        tabs: [{ windowId: "1", tabId: "2", url: "https://example.com" }],
        commandIds: ["reload"],
      }),
      undefined,
    );
    assert.equal(
      tabJumpTarget({
        query: "",
        siteIds: ["youtube"],
        tabs: [{ windowId: "1", tabId: "2", url: "https://example.com" }],
      }),
      undefined,
    );
  });
});

describe("firstActionItemId", () => {
  it("returns undefined when there is no action", () => {
    assert.equal(firstActionItemId({ siteIds: [], tabs: [] }), undefined);
  });
});
