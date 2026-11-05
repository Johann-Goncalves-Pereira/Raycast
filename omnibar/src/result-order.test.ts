import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MRU_TAB_LIMIT,
  NEW_SEARCH_ITEM_ID,
  SCOPED_SEARCH_ITEM_ID,
  bangItemId,
  commandItemId,
  firstActionItemId,
  historyItemId,
  isActionScopeQuery,
  mruTabs,
  parseQueryScope,
  sectionsForQuery,
  selectionAfterType,
  tabItemId,
  tabJumpTarget,
} from "./result-order";

describe("parseQueryScope / isActionScopeQuery", () => {
  it("treats / alone and /filter as commands-only scope", () => {
    assert.equal(isActionScopeQuery("/"), true);
    assert.equal(isActionScopeQuery("/ reload"), true);
    assert.equal(isActionScopeQuery("/reload"), true);
    assert.deepEqual(parseQueryScope("/"), {
      mode: "commands",
      filterQuery: "",
    });
    assert.deepEqual(parseQueryScope("/ reload"), {
      mode: "commands",
      filterQuery: "reload",
    });
  });

  it("treats plain queries as unified", () => {
    assert.equal(isActionScopeQuery("reload"), false);
    assert.deepEqual(parseQueryScope("github"), {
      mode: "unified",
      filterQuery: "github",
    });
  });

  it("lists bangs for @ alone", () => {
    assert.deepEqual(parseQueryScope("@"), {
      mode: "bangs",
      filterQuery: "",
    });
  });
});

describe("sectionsForQuery", () => {
  it("puts search then history ahead of tabs while typing", () => {
    assert.deepEqual(sectionsForQuery("raycast"), [
      "search",
      "history",
      "actions",
      "answers",
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
    assert.deepEqual(sectionsForQuery("/"), ["commands"]);
  });

  it("scopes to bangs for @ alone", () => {
    assert.deepEqual(sectionsForQuery("@"), ["bangs"]);
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
        historyUrls: ["https://history.example"],
      }),
      tabItemId(tab),
    );
  });

  it("selects first history when no tab matches", () => {
    assert.equal(
      selectionAfterType({
        query: "docs",
        scoped: false,
        matchingTabs: [],
        historyUrls: ["https://docs.example/a"],
      }),
      historyItemId("https://docs.example/a"),
    );
  });

  it("falls back to clean search when no tab or history", () => {
    assert.equal(
      selectionAfterType({
        query: "docs",
        scoped: false,
        matchingTabs: [],
        historyUrls: [],
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

  it("selects the first bang under @ listing", () => {
    assert.equal(
      selectionAfterType({
        query: "@",
        scoped: false,
        bangIds: ["youtube"],
      }),
      bangItemId("youtube"),
    );
  });
});

describe("tabJumpTarget", () => {
  it("jumps to the bang before a site action", () => {
    assert.equal(
      tabJumpTarget({
        query: "you",
        bangIds: ["youtube"],
        siteIds: ["youtube"],
        tabs: [{ windowId: "1", tabId: "2", url: "https://example.com" }],
      }),
      bangItemId("youtube"),
    );
  });

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
  });
});

describe("firstActionItemId", () => {
  it("returns undefined when there is no action", () => {
    assert.equal(firstActionItemId({ siteIds: [], tabs: [] }), undefined);
  });
});
