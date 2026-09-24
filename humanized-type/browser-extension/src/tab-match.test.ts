import { describe, expect, it } from "vitest";
import { findLockedTabId } from "./tab-match.js";

const locked = "https://docs.google.com/document/d/locked/edit";

describe("findLockedTabId", () => {
  it("returns only the tab whose URL is the locked document", () => {
    const id = findLockedTabId(
      [
        { id: 1, url: "https://example.com/other" },
        { id: 2, url: locked },
      ],
      locked,
    );
    expect(id).toBe(2);
  });

  it("does not attach when the URL differs", () => {
    const id = findLockedTabId(
      [{ id: 1, url: "https://example.com/other" }],
      locked,
    );
    expect(id).toBeNull();
  });
});
