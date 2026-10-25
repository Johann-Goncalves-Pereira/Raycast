import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { BrowserDefinition } from "./browser-catalog";
import {
  filterHistory,
  getBrowserHistory,
  mapHistoryRows,
  type HistoryItem,
  type HistoryRow,
} from "./browser-history";

const safariBrowser: BrowserDefinition = {
  id: "safari",
  name: "Safari",
  bundleId: "com.apple.Safari",
  engine: "webkit",
};

const sampleRows: HistoryRow[] = [
  {
    url: "https://www.youtube.com/watch?v=abc",
    title: "Cool Video",
    last_visit_time: 300,
    visit_count: 5,
  },
  {
    url: "https://github.com/raycast/extensions",
    title: "Raycast Extensions",
    last_visit_time: 200,
    visit_count: 2,
  },
  {
    url: "chrome://settings/",
    title: "Settings",
    last_visit_time: 400,
    visit_count: 1,
  },
  {
    url: "chrome-extension://abcdef/popup.html",
    title: "Extension",
    last_visit_time: 500,
    visit_count: 1,
  },
  {
    url: "https://www.youtube.com/watch?v=abc#t=10",
    title: "Cool Video dup",
    last_visit_time: 100,
    visit_count: 1,
  },
  {
    url: "https://example.com/",
    title: "",
    last_visit_time: 50,
    visit_count: 1,
  },
];

describe("mapHistoryRows", () => {
  it("drops internal URLs and dedupes by normalized URL", () => {
    const items = mapHistoryRows(sampleRows);
    assert.equal(items.length, 3);
    assert.ok(!items.some((i) => i.url.startsWith("chrome")));
    assert.equal(
      items.filter((i) => i.url.includes("youtube.com/watch")).length,
      1,
    );
  });

  it("falls back to domain when title is blank", () => {
    const items = mapHistoryRows(sampleRows);
    const example = items.find((i) => i.domain === "example.com");
    assert.ok(example);
    assert.equal(example!.title, "example.com");
  });
});

describe("filterHistory", () => {
  const items: HistoryItem[] = mapHistoryRows(sampleRows);

  it("filters by query against title and url", () => {
    const matched = filterHistory(items, "raycast", undefined, 12);
    assert.equal(matched.length, 1);
    assert.match(matched[0]!.url, /github\.com/);
  });

  it("filters by domain scope for site search", () => {
    const matched = filterHistory(items, "", ["youtube.com"], 12);
    assert.equal(matched.length, 1);
    assert.match(matched[0]!.url, /youtube\.com/);
  });

  it("combines domain filter with query", () => {
    const matched = filterHistory(items, "cool", ["youtube.com"], 12);
    assert.equal(matched.length, 1);
    assert.equal(matched[0]!.title, "Cool Video");
  });

  it("respects limit", () => {
    assert.equal(filterHistory(items, "", undefined, 1).length, 1);
  });
});

describe("getBrowserHistory", () => {
  it("returns no history for WebKit browsers", () => {
    assert.deepEqual(getBrowserHistory(safariBrowser), []);
  });
});

describe("sqlite3 History fixture round-trip", () => {
  let fixtureRoot: string | undefined;

  after(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("reads urls JSON from a History database copy", () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "browser-spotlight-hist-"));
    const historyDb = join(fixtureRoot, "History");
    execFileSync("sqlite3", [
      historyDb,
      `CREATE TABLE urls (
        id INTEGER PRIMARY KEY,
        url LONGVARCHAR,
        title LONGVARCHAR,
        visit_count INTEGER DEFAULT 0,
        typed_count INTEGER DEFAULT 0,
        last_visit_time INTEGER NOT NULL,
        hidden INTEGER DEFAULT 0
      );
      INSERT INTO urls (id, url, title, visit_count, last_visit_time, hidden) VALUES
        (1, 'https://www.youtube.com/watch?v=1', 'Video One', 3, 1000, 0),
        (2, 'chrome://newtab/', 'New Tab', 10, 2000, 0),
        (3, 'https://github.com/foo', 'Foo', 1, 900, 0),
        (4, 'https://hidden.example/', 'Hidden', 1, 800, 1);`,
    ]);

    const rows = JSON.parse(
      execFileSync(
        "sqlite3",
        [
          historyDb,
          "-json",
          `SELECT url, title, last_visit_time, visit_count
           FROM urls
           WHERE hidden = 0
             AND url NOT LIKE 'chrome://%'
             AND url NOT LIKE 'chrome-extension://%'
           ORDER BY last_visit_time DESC
           LIMIT 200`,
        ],
        { encoding: "utf8" },
      ),
    ) as HistoryRow[];

    const items = mapHistoryRows(rows);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.domain, "youtube.com");
    assert.equal(items[1]?.domain, "github.com");
    assert.ok(existsSync(historyDb));
  });
});
