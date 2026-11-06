import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLoadedPage,
  matchingSpacePages,
  pagesOnThisSpace,
  onScreenWindowsScript,
  parseListedPages,
  parseOnScreenTitles,
  parseOpenSpaceHeld,
  parseWindowNameLines,
} from "./open-pages";

const github = {
  title: "Raycast",
  url: "https://github.com/raycast",
  domain: "github.com",
  windowId: "1",
  tabId: "1",
  loaded: true,
};

describe("parseOpenSpaceHeld", () => {
  it("is true only while Cmd+Shift is held", () => {
    assert.equal(parseOpenSpaceHeld('{"openSpace":true}'), true);
    assert.equal(parseOpenSpaceHeld('{"openSpace":false}'), false);
    assert.equal(parseOpenSpaceHeld(undefined), false);
  });
});

describe("parseOnScreenTitles", () => {
  it("reads window titles on the current Space", () => {
    assert.deepEqual(
      parseOnScreenTitles('{"titles":["Raycast — Zen","",1]}'),
      ["Raycast — Zen"],
    );
  });
});

describe("onScreenWindowsScript", () => {
  it("asks System Events for the browser's windows on this Space", () => {
    const script = onScreenWindowsScript("app.zen-browser.zen");
    assert.match(script, /app\.zen-browser\.zen/);
    assert.match(script, /bundle identifier/);
    assert.deepEqual(
      parseWindowNameLines("Raycast — Zen\n\nDocs\n"),
      ["Raycast — Zen", "Docs"],
    );
  });
});

describe("isLoadedPage", () => {
  it("drops blank and new-tab pages", () => {
    assert.equal(isLoadedPage("about:blank"), false);
    assert.equal(isLoadedPage("chrome://newtab/"), false);
    assert.equal(isLoadedPage("https://github.com/raycast"), true);
  });
});

describe("parseListedPages", () => {
  it("marks a tab the browser still reports as loading", () => {
    const pages = parseListedPages(
      "Raycast\nhttps://github.com/raycast\n1\n2\nfalse\n\n",
    );
    assert.equal(pages[0]?.loaded, false);
    assert.equal(pages[0]?.windowId, "1");
  });
});

describe("pagesOnThisSpace", () => {
  it("keeps loaded pages from windows on this Space and ranks them as that set", () => {
    const other = {
      ...github,
      title: "Mail",
      url: "https://mail.example",
      domain: "mail.example",
      windowId: "2",
    };
    const loading = { ...github, tabId: "2", loaded: false, title: "Raycast" };
    const blank = {
      ...github,
      tabId: "3",
      url: "about:blank",
      title: "New Tab",
    };
    const sibling = {
      ...github,
      tabId: "4",
      title: "Pulls",
      url: "https://github.com/raycast/pulls",
    };
    const pages = pagesOnThisSpace(
      [github, sibling, other, loading, blank],
      ["Raycast — Zen"],
    );
    assert.deepEqual(
      pages.map((page) => page.tabId),
      ["1", "4"],
    );
  });
});

describe("matchingSpacePages", () => {
  it("filters the Space list by the typed query", () => {
    const docs = {
      ...github,
      title: "Docs",
      url: "https://docs.example",
      domain: "docs.example",
      tabId: "9",
    };
    const pages = matchingSpacePages([github, docs], ["Raycast", "Docs"], "doc");
    assert.deepEqual(
      pages.map((page) => page.url),
      ["https://docs.example"],
    );
  });
});
