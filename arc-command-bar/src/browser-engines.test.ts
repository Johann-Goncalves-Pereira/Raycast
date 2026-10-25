import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  expandSearchUrl,
  getBrowserSearchEngines,
  mapKeywordRowsToEngines,
  type KeywordRow,
} from "./browser-engines";
import type { BrowserDefinition } from "./browser-catalog";

const safariBrowser: BrowserDefinition = {
  id: "safari",
  name: "Safari",
  bundleId: "com.apple.Safari",
  engine: "webkit",
};

const sampleRows: KeywordRow[] = [
  {
    id: 1,
    short_name: "YouTube",
    keyword: "youtube.com",
    url: "https://www.youtube.com/results?search_query={searchTerms}",
    is_active: 1,
    prepopulate_id: 0,
    usage_count: 10,
  },
  {
    id: 2,
    short_name: "Bookmarks",
    keyword: "@bookmarks",
    url: "chrome://bookmarks/?q={searchTerms}",
    is_active: 1,
    prepopulate_id: 0,
    usage_count: 0,
  },
  {
    id: 3,
    short_name: "Inactive Site",
    keyword: "inactive.example",
    url: "https://inactive.example/search?q={searchTerms}",
    is_active: 0,
    prepopulate_id: 0,
    usage_count: 0,
  },
  {
    id: 4,
    short_name: "Google",
    keyword: "google.com",
    url: "{google:baseURL}search?q={searchTerms}&{google:RLZ}",
    is_active: 0,
    prepopulate_id: 1,
    usage_count: 100,
  },
];

describe("expandSearchUrl", () => {
  it("replaces {searchTerms} and %s", () => {
    assert.equal(
      expandSearchUrl(
        "https://example.com/search?q={searchTerms}",
        "hello world",
      ),
      "https://example.com/search?q=hello%20world",
    );
    assert.equal(
      expandSearchUrl("https://reddit.com/search/?q=%s", "cats"),
      "https://reddit.com/search/?q=cats",
    );
  });

  it("expands Google base URL placeholders", () => {
    const url = expandSearchUrl(
      "{google:baseURL}search?q={searchTerms}&{google:RLZ}",
      "raycast",
    );
    assert.match(url, /^https:\/\/www\.google\.com\/search\?q=raycast/);
    assert.doesNotMatch(url, /\{/);
  });

  it("decodes ungoogled Chromium host aliases", () => {
    assert.match(
      expandSearchUrl(
        "https://gemini.9oo91e.qjz9zk/app?q={searchTerms}",
        "test",
      ),
      /gemini\.google\.com/,
    );
  });
});

describe("mapKeywordRowsToEngines", () => {
  it("keeps active site search and prepopulated engines", () => {
    const engines = mapKeywordRowsToEngines(sampleRows);
    assert.equal(engines.length, 2);
    assert.equal(engines[0]?.name, "YouTube");
    assert.ok(engines[0]?.keywords.includes("youtube.com"));
    assert.ok(engines[0]?.keywords.includes("youtube"));
    assert.equal(engines[1]?.name, "Google");
  });

  it("drops internal chrome:// shortcuts and inactive discoveries", () => {
    const engines = mapKeywordRowsToEngines(sampleRows);
    assert.ok(!engines.some((e) => e.name === "Bookmarks"));
    assert.ok(!engines.some((e) => e.name === "Inactive Site"));
  });

  it("builds concrete search URLs from templates", () => {
    const engines = mapKeywordRowsToEngines(sampleRows);
    const youtube = engines.find((e) => e.name === "YouTube");
    assert.equal(
      expandSearchUrl(youtube!.urlTemplate, "novel"),
      "https://www.youtube.com/results?search_query=novel",
    );
  });
});

describe("getBrowserSearchEngines", () => {
  it("returns no engines for WebKit browsers", () => {
    assert.deepEqual(getBrowserSearchEngines(safariBrowser), []);
  });
});

describe("sqlite3 fixture round-trip", () => {
  let fixtureRoot: string | undefined;

  after(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("reads keywords JSON from a Web Data database copy", () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "browser-spotlight-fixture-"));
    const webData = join(fixtureRoot, "Web Data");
    execFileSync("sqlite3", [
      webData,
      `CREATE TABLE keywords (
        id INTEGER PRIMARY KEY,
        short_name VARCHAR NOT NULL,
        keyword VARCHAR NOT NULL,
        favicon_url VARCHAR NOT NULL,
        url VARCHAR NOT NULL,
        safe_for_autoreplace INTEGER,
        originating_url VARCHAR,
        date_created INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        input_encodings VARCHAR,
        suggest_url VARCHAR,
        prepopulate_id INTEGER DEFAULT 0,
        created_by_policy INTEGER DEFAULT 0,
        last_modified INTEGER DEFAULT 0,
        sync_guid VARCHAR,
        alternate_urls VARCHAR,
        image_url VARCHAR,
        search_url_post_params VARCHAR,
        suggest_url_post_params VARCHAR,
        image_url_post_params VARCHAR,
        new_tab_url VARCHAR,
        last_visited INTEGER DEFAULT 0,
        created_from_play_api INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 0,
        starter_pack_id INTEGER DEFAULT 0,
        enforced_by_policy INTEGER DEFAULT 0,
        featured_by_policy INTEGER DEFAULT 0,
        url_hash BLOB
      );
      INSERT INTO keywords (
        id, short_name, keyword, favicon_url, url, safe_for_autoreplace,
        originating_url, usage_count, prepopulate_id, is_active
      ) VALUES
        (21, 'YouTube', 'youtube.com', '', 'https://www.youtube.com/results?search_query=%s', 0, '', 5, 0, 1),
        (22, 'Gemini', 'g', '', 'https://gemini.google.com/app?q={searchTerms}', 0, '', 2, 0, 1);`,
    ]);

    const rows = JSON.parse(
      execFileSync(
        "sqlite3",
        [
          webData,
          "-json",
          "SELECT id, short_name, keyword, url, is_active, prepopulate_id, usage_count FROM keywords",
        ],
        { encoding: "utf8" },
      ),
    ) as KeywordRow[];

    const engines = mapKeywordRowsToEngines(rows);
    assert.equal(engines.length, 2);
    assert.ok(engines.some((e) => e.keywords.includes("g")));
    assert.ok(engines.some((e) => e.name === "YouTube"));
    assert.ok(existsSync(webData));
  });
});
