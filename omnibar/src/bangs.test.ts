import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FALLBACK_BANGS,
  bangForTab,
  bangScore,
  parseBangQuery,
  rankBangs,
  resolveBangPrefix,
  type BangUsageMap,
} from "./bangs";

describe("parseBangQuery", () => {
  it("detects @ listing and scoped tokens", () => {
    assert.deepEqual(parseBangQuery("@"), {
      bangToken: "",
      rest: "",
      listingAll: true,
    });
    assert.deepEqual(parseBangQuery("@youtube cats"), {
      bangToken: "youtube",
      rest: "cats",
      listingAll: false,
    });
    assert.deepEqual(parseBangQuery("plain"), {
      bangToken: null,
      rest: "plain",
      listingAll: false,
    });
  });
});

describe("resolveBangPrefix / rankBangs", () => {
  it("prefers more frequently used bangs for ambiguous prefixes", () => {
    const usage: BangUsageMap = {
      youtube: { count: 12, lastUsedAt: Date.now() },
      yahoo: { count: 1, lastUsedAt: Date.now() - 86_400_000 },
    };
    const bang = resolveBangPrefix("y", FALLBACK_BANGS, usage);
    assert.equal(bang?.id, "youtube");
  });

  it("normalizes casing for exact @Ask", () => {
    const bang = resolveBangPrefix("@ask", FALLBACK_BANGS, {});
    assert.equal(bang?.id, "ask");
    assert.equal(bang?.trigger, "@Ask");
  });

  it("ranks by score", () => {
    const usage: BangUsageMap = {
      yahoo: { count: 50, lastUsedAt: Date.now() },
      youtube: { count: 1, lastUsedAt: 0 },
    };
    const ranked = rankBangs(FALLBACK_BANGS, usage);
    assert.equal(ranked[0]?.id, "yahoo");
  });
});

describe("bangForTab", () => {
  it("completes You to @YouTube", () => {
    assert.equal(bangForTab("You", FALLBACK_BANGS)?.trigger, "@YouTube");
    assert.equal(bangForTab("you", FALLBACK_BANGS)?.id, "youtube");
  });

  it("keeps @YouTube when Yahoo is in the catalog", () => {
    assert.equal(
      FALLBACK_BANGS.some((bang) => bang.id === "yahoo"),
      true,
    );
    assert.equal(bangForTab("You", FALLBACK_BANGS)?.trigger, "@YouTube");
  });

  it("does not complete multi-word queries or command scope", () => {
    assert.equal(bangForTab("You cats", FALLBACK_BANGS), undefined);
    assert.equal(bangForTab("/reload", FALLBACK_BANGS), undefined);
    assert.equal(bangForTab("@", FALLBACK_BANGS), undefined);
  });
});

describe("bangScore", () => {
  it("returns 0 for unused bangs", () => {
    assert.equal(bangScore(undefined, Date.now()), 0);
  });
});
