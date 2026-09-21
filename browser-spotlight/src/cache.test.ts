import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  CacheStore,
  TTL,
  cacheKey,
  readFresh,
  readStale,
  setCacheStore,
  writeCache,
} from "./cache";
import {
  expandSearchUrl,
  mapKeywordRowsToEngines,
  type KeywordRow,
} from "./browser-engines";
import { siteEnginesFromKeywords } from "./site-search";

function memoryStore(): CacheStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get(key) {
      return map.get(key);
    },
    set(key, data) {
      map.set(key, data);
    },
    remove(key) {
      return map.delete(key);
    },
  };
}

describe("cache TTL helper", () => {
  afterEach(() => {
    setCacheStore(undefined);
  });

  it("returns fresh data within maxAgeMs", () => {
    const store = memoryStore();
    setCacheStore(store);
    const key = cacheKey("history", "com.example.Browser");
    const now = 1_000_000;
    writeCache(key, [{ url: "https://a.test" }], store, now);

    const fresh = readFresh<{ url: string }[]>(
      key,
      TTL.history,
      store,
      now + 10_000,
    );
    assert.deepEqual(fresh, [{ url: "https://a.test" }]);
  });

  it("returns undefined when entry is older than maxAgeMs", () => {
    const store = memoryStore();
    setCacheStore(store);
    const key = cacheKey("history", "com.example.Browser");
    const now = 1_000_000;
    writeCache(key, [{ url: "https://a.test" }], store, now);

    const fresh = readFresh(
      key,
      TTL.history,
      store,
      now + TTL.history + 1,
    );
    assert.equal(fresh, undefined);
  });

  it("readStale returns data regardless of age", () => {
    const store = memoryStore();
    const key = cacheKey("tabs", "com.example.Browser");
    const now = 1_000_000;
    writeCache(key, [{ title: "Old" }], store, now);

    const stale = readStale<{ title: string }[]>(
      key,
      store,
    );
    assert.deepEqual(stale, [{ title: "Old" }]);
    assert.equal(
      readFresh(key, TTL.tabs, store, now + TTL.tabs + 5_000),
      undefined,
    );
  });

  it("ignores corrupt cache payloads", () => {
    const store = memoryStore();
    store.set(cacheKey("engines", "x"), "not-json");
    assert.equal(readFresh(cacheKey("engines", "x"), TTL.engines, store), undefined);
  });
});

describe("site engine JSON round-trip", () => {
  it("reconstructs buildUrl from urlTemplate after JSON serialize", () => {
    const rows: KeywordRow[] = [
      {
        id: 21,
        short_name: "YouTube",
        keyword: "youtube.com",
        url: "https://www.youtube.com/results?search_query={searchTerms}",
        is_active: 1,
        prepopulate_id: 0,
        usage_count: 5,
      },
    ];
    const keywords = mapKeywordRowsToEngines(rows);
    const serialized = JSON.parse(JSON.stringify(keywords));
    const engines = siteEnginesFromKeywords(serialized);

    assert.equal(engines.length, 1);
    assert.equal(engines[0].name, "YouTube");
    assert.equal(
      engines[0].buildUrl("cats"),
      expandSearchUrl(keywords[0].urlTemplate, "cats"),
    );
    assert.equal(
      engines[0].buildUrl("cats"),
      "https://www.youtube.com/results?search_query=cats",
    );
  });
});
