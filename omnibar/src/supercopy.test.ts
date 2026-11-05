import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMarkdownLink, sanitizeUrl, sanitizeUrls } from "./supercopy";

describe("sanitizeUrl", () => {
  it("strips utm_*, fbclid, and gclid", () => {
    assert.equal(
      sanitizeUrl(
        "https://example.com/path?utm_source=x&utm_medium=y&id=1&fbclid=abc&gclid=def",
      ),
      "https://example.com/path?id=1",
    );
  });

  it("strips common marketing params and leaves the rest", () => {
    assert.equal(
      sanitizeUrl(
        "https://shop.test/item?mc_cid=1&mc_eid=2&ref=twitter&q=keep",
      ),
      "https://shop.test/item?q=keep",
    );
  });

  it("returns the original string when URL parsing fails", () => {
    assert.equal(sanitizeUrl("not a url"), "not a url");
  });

  it("handles URLs with only tracking params", () => {
    assert.equal(
      sanitizeUrl("https://example.com/?utm_campaign=spring"),
      "https://example.com/",
    );
  });
});

describe("sanitizeUrls / formatMarkdownLink", () => {
  it("joins sanitized URLs with newlines", () => {
    assert.equal(
      sanitizeUrls([
        "https://a.test/?utm_source=x",
        "https://b.test/?fbclid=1",
      ]),
      "https://a.test/\nhttps://b.test/",
    );
  });

  it("formats a markdown link with a sanitized URL", () => {
    assert.equal(
      formatMarkdownLink("Docs", "https://docs.test/?utm_source=arc"),
      "[Docs](https://docs.test/)",
    );
  });
});
