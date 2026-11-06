import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dismissDecision, queryStateRecord } from "./dismiss";

describe("dismissDecision", () => {
  it("closes on Escape even when the query has text", () => {
    assert.equal(
      dismissDecision({ key: "escape", queryEmpty: false, scoped: true }),
      "close",
    );
    assert.equal(
      dismissDecision({ key: "escape", queryEmpty: true, scoped: false }),
      "close",
    );
  });

  it("lets Backspace edit a non-empty query", () => {
    assert.equal(
      dismissDecision({ key: "backspace", queryEmpty: false, scoped: false }),
      "type",
    );
    assert.equal(
      dismissDecision({ key: "backspace", queryEmpty: false, scoped: true }),
      "type",
    );
  });

  it("leaves a bang on empty Backspace and closes at the root", () => {
    assert.equal(
      dismissDecision({ key: "backspace", queryEmpty: true, scoped: true }),
      "exit-scope",
    );
    assert.equal(
      dismissDecision({ key: "backspace", queryEmpty: true, scoped: false }),
      "close",
    );
  });
});

describe("queryStateRecord", () => {
  it("marks an empty unscoped field and a scoped query", () => {
    assert.deepEqual(queryStateRecord({ searchText: "", scoped: false }), {
      empty: true,
      scoped: false,
    });
    assert.deepEqual(queryStateRecord({ searchText: "test", scoped: true }), {
      empty: false,
      scoped: true,
    });
  });
});
