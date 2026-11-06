import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_BANGS } from "./bangs";
import { navigableHttpUrl, scopedSubmitUrl } from "./submit-target";

const github = FALLBACK_BANGS.find((bang) => bang.id === "github");

describe("scopedSubmitUrl", () => {
  it("opens the bang page for Cmd+Enter instead of leaving the bang", () => {
    assert.ok(github);
    assert.deepEqual(
      scopedSubmitUrl({
        query: "test",
        bang: github ?? null,
        site: null,
      }),
      {
        kind: "scoped",
        url: "https://github.com/search?q=test",
      },
    );
  });

  it("does nothing on an empty bang query", () => {
    assert.ok(github);
    assert.deepEqual(
      scopedSubmitUrl({ query: "   ", bang: github ?? null, site: null }),
      { kind: "ignore" },
    );
  });

  it("uses a scoped site URL", () => {
    assert.deepEqual(
      scopedSubmitUrl({
        query: "cats",
        bang: null,
        site: {
          buildUrl: (query) =>
            `https://www.youtube.com/results?search_query=${query}`,
        },
      }),
      {
        kind: "scoped",
        url: "https://www.youtube.com/results?search_query=cats",
      },
    );
  });

  it("keeps an unscoped query on the browser search engine", () => {
    assert.deepEqual(
      scopedSubmitUrl({ query: "cats", bang: null, site: null }),
      { kind: "engine", query: "cats" },
    );
  });

  it("opens a pasted http URL instead of searching it, even inside a bang", () => {
    assert.equal(
      navigableHttpUrl("https://www.linkedin.com/"),
      "https://www.linkedin.com/",
    );
    assert.equal(navigableHttpUrl("github.com"), null);
    assert.deepEqual(
      scopedSubmitUrl({
        query: "https://www.linkedin.com/",
        bang: github ?? null,
        site: null,
      }),
      { kind: "scoped", url: "https://www.linkedin.com/" },
    );
    assert.deepEqual(
      scopedSubmitUrl({ query: "github.com", bang: null, site: null }),
      { kind: "engine", query: "github.com" },
    );
  });
});
