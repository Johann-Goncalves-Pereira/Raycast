import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearedSession, sessionFields, sessionForOpen } from "./session";

describe("clearedSession", () => {
  it("is empty after a search is sent to the browser", () => {
    assert.deepEqual(clearedSession(), {
      searchText: "",
      scopedId: null,
      scopedKind: null,
    });
  });
});

describe("sessionForOpen", () => {
  const draft = {
    searchText: "cats",
    scopedId: "youtube",
    scopedKind: "bang" as const,
    updatedAt: 10_000,
  };

  it("opens clean when the draft is two seconds old", () => {
    assert.deepEqual(
      sessionForOpen({ session: draft, now: 12_000 }),
      clearedSession(),
    );
  });

  it("keeps a draft that is still inside two seconds", () => {
    assert.deepEqual(sessionForOpen({ session: draft, now: 11_000 }), {
      searchText: "cats",
      scopedId: "youtube",
      scopedKind: "bang",
    });
  });
});

describe("sessionFields", () => {
  it("clears the query when the next browser has no saved session", () => {
    assert.deepEqual(sessionFields(undefined), clearedSession());
  });

  it("restores the query saved for that browser", () => {
    assert.deepEqual(
      sessionFields({
        searchText: "cats",
        scopedId: "youtube",
        scopedKind: "bang",
        updatedAt: 1,
      }),
      { searchText: "cats", scopedId: "youtube", scopedKind: "bang" },
    );
  });
});
