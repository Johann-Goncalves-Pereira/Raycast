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
  listAfterQuick,
  quickPicks,
  sectionsForQuery,
  uniqueBySite,
  uniqueLabels,
  selectionAfterReport,
  selectionAfterType,
  shouldResetSelection,
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
  it("puts this Space and a two-item quick section above history while typing", () => {
    const sections = sectionsForQuery("raycast");
    assert.deepEqual(sections, [
      "search",
      "space",
      "quick",
      "history",
      "actions",
      "answers",
      "bookmarks",
      "commands",
    ]);
    assert.ok(sections.indexOf("space") < sections.indexOf("history"));
    assert.ok(sections.indexOf("quick") < sections.indexOf("history"));
  });

  it("shows this Space and quick picks above history when empty", () => {
    assert.deepEqual(sectionsForQuery("   "), [
      "actions",
      "commands",
      "space",
      "quick",
      "history",
      "bookmarks",
    ]);
  });

  it("shows only open pages on this Space while Cmd+Shift is held", () => {
    assert.deepEqual(sectionsForQuery("raycast", { spaceOnly: true }), [
      "space",
    ]);
    assert.deepEqual(sectionsForQuery("/", { spaceOnly: true }), ["space"]);
  });

  it("scopes exclusively to commands for / queries", () => {
    assert.deepEqual(sectionsForQuery("/ pin"), ["commands"]);
    assert.deepEqual(sectionsForQuery("/"), ["commands"]);
  });

  it("scopes to bangs for @ alone", () => {
    assert.deepEqual(sectionsForQuery("@"), ["bangs"]);
  });
});

describe("quickPicks", () => {
  it("keeps two suggestions and two history rows for the preview", () => {
    assert.deepEqual(quickPicks(["a", "b", "c", "d"]), ["a", "b"]);
    assert.deepEqual(quickPicks(["only"]), ["only"]);
  });
});

describe("uniqueBySite", () => {
  it("shows a site once and leaves the rest for the list under Quick", () => {
    const items = [
      { domain: "youtube.com", url: "https://youtube.com/watch?v=1" },
      { domain: "www.youtube.com", url: "https://www.youtube.com/feed" },
      { domain: "github.com", url: "https://github.com/raycast" },
      { domain: "mail.google.com", url: "https://mail.google.com" },
    ];
    const unique = uniqueBySite(items);
    assert.deepEqual(
      unique.map((item) => item.url),
      [
        "https://youtube.com/watch?v=1",
        "https://github.com/raycast",
        "https://mail.google.com",
      ],
    );
    assert.deepEqual(
      quickPicks(unique).map((item) => item.domain),
      ["youtube.com", "github.com"],
    );
    assert.deepEqual(
      listAfterQuick(unique).map((item) => item.domain),
      ["mail.google.com"],
    );
  });
});

describe("uniqueLabels", () => {
  it("does not repeat a suggestion that Quick already shows", () => {
    const labels = uniqueLabels(["YouTube", "youtube", "youtube entrar"]);
    assert.deepEqual(quickPicks(labels), ["YouTube", "youtube entrar"]);
    assert.deepEqual(listAfterQuick(labels), []);
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

  it("selects the search row when the query is an http URL", () => {
    assert.equal(
      selectionAfterType({
        query: "https://www.linkedin.com/",
        scoped: false,
        matchingTabs: [tab],
        historyUrls: ["https://www.linkedin.com/feed/"],
      }),
      NEW_SEARCH_ITEM_ID,
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

describe("selectionAfterReport", () => {
  it("keeps the history or suggestion row instead of snapping to the pin", () => {
    assert.deepEqual(
      selectionAfterReport({
        pinnedId: "scoped-search",
        reportedId: "history-https://github.com/raycast",
      }),
      {
        selectedId: "history-https://github.com/raycast",
        pinnedId: undefined,
      },
    );
  });
});

describe("shouldResetSelection", () => {
  it("leaves the row alone when the same query's results refresh", () => {
    assert.equal(
      shouldResetSelection({
        previousQueryKey: "github|test",
        nextQueryKey: "github|test",
      }),
      false,
    );
  });

  it("resets when the query or bang changes", () => {
    assert.equal(
      shouldResetSelection({ previousQueryKey: null, nextQueryKey: "|test" }),
      true,
    );
    assert.equal(
      shouldResetSelection({
        previousQueryKey: "|test",
        nextQueryKey: "github|test",
      }),
      true,
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
