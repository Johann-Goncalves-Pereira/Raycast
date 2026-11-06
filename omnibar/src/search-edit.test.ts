import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextSearchEdit, shouldRestoreSession } from "./search-edit";

describe("shouldRestoreSession", () => {
  it("skips restore once the user has typed or the session was applied", () => {
    assert.equal(
      shouldRestoreSession({ alreadyRestored: false, userEdited: false }),
      true,
    );
    assert.equal(
      shouldRestoreSession({ alreadyRestored: false, userEdited: true }),
      false,
    );
    assert.equal(
      shouldRestoreSession({ alreadyRestored: true, userEdited: false }),
      false,
    );
  });
});

describe("nextSearchEdit", () => {
  it("keeps the scope when Tab clears the query", () => {
    assert.equal(
      nextSearchEdit({
        scoped: true,
        searchText: "You",
        next: "",
        ignoringEmpty: true,
      }),
      "ignore-clear",
    );
    assert.equal(
      nextSearchEdit({
        scoped: true,
        searchText: "",
        next: "",
        ignoringEmpty: true,
      }),
      "ignore-clear",
    );
  });

  it("leaves the scope when the scoped query is already empty", () => {
    assert.equal(
      nextSearchEdit({
        scoped: true,
        searchText: "",
        next: "",
        ignoringEmpty: false,
      }),
      "exit-scope",
    );
  });

  it("applies typed text", () => {
    assert.equal(
      nextSearchEdit({
        scoped: false,
        searchText: "",
        next: "You",
        ignoringEmpty: false,
      }),
      "apply",
    );
  });
});
