import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserDefinition } from "./browser-catalog";
import {
  FALLBACK_SITE_ENGINES,
  findSiteEngineByDomain,
  isYouTubeEngine,
  loadSiteEngines,
  matchingSiteEngines,
  resolveEngineKeyword,
} from "./site-search";

const engines = [
  {
    id: "kw-21",
    name: "YouTube",
    keywords: ["youtube.com", "youtube"],
    domains: ["youtube.com"],
    buildUrl: (q: string) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  },
  {
    id: "kw-22",
    name: "Gemini",
    keywords: ["g", "gemini"],
    domains: ["gemini.google.com"],
    buildUrl: (q: string) =>
      `https://gemini.google.com/app?q=${encodeURIComponent(q)}`,
  },
  {
    id: "kw-23",
    name: "GitHub",
    keywords: ["github", "github.com"],
    domains: ["github.com"],
    buildUrl: (q: string) =>
      `https://github.com/search?q=${encodeURIComponent(q)}`,
  },
];

describe("resolveEngineKeyword", () => {
  it("matches exact omnibox keywords", () => {
    assert.equal(resolveEngineKeyword("youtube.com", engines)?.name, "YouTube");
    assert.equal(resolveEngineKeyword("g", engines)?.name, "Gemini");
  });

  it("resolves unique prefixes like Chrome/Arc", () => {
    assert.equal(resolveEngineKeyword("you", engines)?.name, "YouTube");
    assert.equal(resolveEngineKeyword("git", engines)?.name, "GitHub");
  });

  it("returns null for ambiguous or multi-word input", () => {
    assert.equal(resolveEngineKeyword("go", engines), null);
    assert.equal(resolveEngineKeyword("youtube cats", engines), null);
    assert.equal(resolveEngineKeyword("", engines), null);
  });
});

describe("matchingSiteEngines", () => {
  it("prioritizes the resolved keyword match first", () => {
    const matches = matchingSiteEngines("you", engines, []);
    assert.equal(matches[0]?.name, "YouTube");
  });

  it("includes tab-derived engines when they match the query", () => {
    const matches = matchingSiteEngines("docs", engines, [
      {
        title: "Raycast docs",
        url: "https://developers.raycast.com/",
        domain: "developers.raycast.com",
        windowId: "1",
        tabId: "1",
      },
    ]);
    assert.ok(matches.some((e) => e.domains.includes("developers.raycast.com")));
  });
});

describe("findSiteEngineByDomain", () => {
  it("matches configured engine domains", () => {
    assert.equal(
      findSiteEngineByDomain("www.youtube.com", engines)?.name,
      "YouTube",
    );
  });
});

describe("isYouTubeEngine", () => {
  it("detects YouTube by domain, keyword, or name", () => {
    assert.equal(isYouTubeEngine(engines[0]), true);
    assert.equal(isYouTubeEngine(engines[1]), false);
  });
});

const safariBrowser: BrowserDefinition = {
  id: "safari",
  name: "Safari",
  bundleId: "com.apple.Safari",
  engine: "webkit",
};

describe("loadSiteEngines", () => {
  it("uses the Safari fallback when browser is null", () => {
    assert.deepEqual(loadSiteEngines(null), FALLBACK_SITE_ENGINES);
  });

  it("returns an empty-derived fallback for WebKit browsers", () => {
    assert.deepEqual(loadSiteEngines(safariBrowser), FALLBACK_SITE_ENGINES);
  });
});
