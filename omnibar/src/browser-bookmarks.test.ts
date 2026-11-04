import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flattenBookmarkTree,
  type ChromiumBookmarkNode,
} from "./browser-bookmarks";

describe("flattenBookmarkTree", () => {
  it("flattens nested folders with folder paths", () => {
    const root: ChromiumBookmarkNode = {
      children: [
        {
          name: "Bookmark Bar",
          type: "folder",
          children: [
            {
              name: "Dev",
              type: "folder",
              children: [
                {
                  id: "10",
                  name: "Raycast",
                  type: "url",
                  url: "https://www.raycast.com/",
                },
              ],
            },
            {
              id: "11",
              name: "GitHub",
              type: "url",
              url: "https://github.com/",
            },
          ],
        },
      ],
    };

    const items = flattenBookmarkTree(root);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, "Raycast");
    assert.equal(items[0].folderPath, "Bookmark Bar / Dev");
    assert.equal(items[0].domain, "raycast.com");
    assert.equal(items[1].title, "GitHub");
    assert.equal(items[1].folderPath, "Bookmark Bar");
  });

  it("skips internal browser URLs", () => {
    const root: ChromiumBookmarkNode = {
      children: [
        {
          id: "1",
          name: "Extensions",
          type: "url",
          url: "chrome://extensions/",
        },
        {
          id: "2",
          name: "Docs",
          type: "url",
          url: "https://docs.example.com/",
        },
      ],
    };
    const items = flattenBookmarkTree(root);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Docs");
  });
});
