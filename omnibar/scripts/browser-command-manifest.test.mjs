import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  commandEntries,
  commandIconPath,
  parseCatalog,
} from "./browser-command-manifest.mjs";

const catalog = `
export const BROWSER_CATALOG = [
  {
    id: "zen",
    name: "Zen",
    bundleId: "app.zen-browser.zen",
    engine: "gecko",
  },
  {
    id: "helium",
    name: "Helium",
    bundleId: "net.imput.helium",
    engine: "chromium",
  },
];
`;

describe("parseCatalog", () => {
  it("reads id, name, and bundle id", () => {
    assert.deepEqual(parseCatalog(catalog), [
      { id: "zen", name: "Zen", bundleId: "app.zen-browser.zen" },
      { id: "helium", name: "Helium", bundleId: "net.imput.helium" },
    ]);
  });
});

describe("commandEntries", () => {
  it("keeps Cmd+P commands enabled and hides the exclusions command", () => {
    const commands = commandEntries(
      [{ id: "zen", name: "Zen" }],
      new Set(["browsers/zen-mark.png"]),
    );
    assert.equal(commands[0].name, "search");
    assert.equal(commands[0].disabledByDefault, undefined);
    assert.equal(commands.length, 3);
    assert.equal(commands[1].name, "cmd-zen");
    assert.equal(commands[1].icon, "browsers/zen-mark.png");
    assert.equal(commandIconPath("zen"), "browsers/zen-mark.png");
    assert.equal(commandIconPath("safari"), "browsers/safari.png");
    assert.equal(commands[1].title, "Zen");
    assert.equal(commands[1].disabledByDefault, undefined);
    assert.equal(commands[2].name, "sync-browser-exclusions");
    assert.equal(commands[2].disabledByDefault, true);
  });

  it("omits an icon file that has not been extracted yet", () => {
    const commands = commandEntries([{ id: "zen", name: "Zen" }], new Set());
    assert.equal(commands[1].icon, undefined);
  });
});
