import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultSearchTemplateFromPreferences,
  exactSearchUrl,
  newTabOpenSucceeded,
  newTabScript,
} from "./exact-search";

describe("defaultSearchTemplateFromPreferences", () => {
  it("reads the Chromium default search template", () => {
    const template = defaultSearchTemplateFromPreferences({
      default_search_provider_data: {
        template_url_data: {
          short_name: "DuckDuckGo",
          url: "https://duckduckgo.com/?q={searchTerms}",
        },
      },
    });
    assert.equal(template, "https://duckduckgo.com/?q={searchTerms}");
  });

  it("ignores templates that cannot take a query", () => {
    assert.equal(
      defaultSearchTemplateFromPreferences({
        default_search_provider_data: {
          template_url_data: { url: "https://example.com/" },
        },
      }),
      undefined,
    );
  });
});

describe("exactSearchUrl", () => {
  it("searches the typed text on the browser default engine", () => {
    const url = exactSearchUrl(
      "github.com",
      "https://duckduckgo.com/?q={searchTerms}",
      "google",
    );
    assert.equal(url, "https://duckduckgo.com/?q=github.com");
    assert.equal(url.includes("https://github.com"), false);
  });

  it("falls back to the Omnibar engine when the browser has no template", () => {
    const url = exactSearchUrl("cats & dogs", undefined, "bing");
    assert.equal(url, "https://www.bing.com/search?q=cats%20%26%20dogs");
  });
});

describe("newTabOpenSucceeded", () => {
  it("does not count a failed AppleScript and a failed open as a new tab", () => {
    assert.equal(newTabOpenSucceeded(false, false), false);
  });

  it("counts either the browser script or the open fallback", () => {
    assert.equal(newTabOpenSucceeded(true, false), true);
    assert.equal(newTabOpenSucceeded(false, true), true);
  });
});

describe("newTabScript", () => {
  it("opens the search URL in a new Chromium tab", () => {
    const url = exactSearchUrl(
      "github.com",
      "https://duckduckgo.com/?q={searchTerms}",
      "google",
    );
    const script = newTabScript("Helium", "chromium", url);
    assert.equal(script?.includes("make new tab"), true);
    assert.equal(script?.includes(url), true);
    assert.equal(script?.includes("https://github.com"), false);
  });

  it("opens a new tab in Safari and Zen", () => {
    const url = "https://www.google.com/search?q=cats";
    assert.equal(
      newTabScript("Safari", "webkit", url)?.includes("make new tab"),
      true,
    );
    assert.equal(
      newTabScript("Zen", "gecko", url)?.includes("open location"),
      true,
    );
  });
});
