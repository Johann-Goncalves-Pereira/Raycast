import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fallbackAppPath,
  listRowIcon,
  preferInstalledAppPath,
} from "./app-icon";

const helium = {
  name: "Helium",
  path: "/Applications/Helium.app",
  bundleId: "net.imput.helium",
};

describe("preferInstalledAppPath", () => {
  it("fills an empty path from the installed app with the same bundle id", () => {
    const resolved = preferInstalledAppPath(
      { name: "Helium", path: "", bundleId: "net.imput.helium" },
      [helium],
    );
    assert.equal(resolved.path, "/Applications/Helium.app");
  });

  it("keeps a path that is already set", () => {
    const resolved = preferInstalledAppPath(
      {
        name: "Helium",
        path: "/Custom/Helium.app",
        bundleId: "net.imput.helium",
      },
      [helium],
    );
    assert.equal(resolved.path, "/Custom/Helium.app");
  });
});

describe("fallbackAppPath", () => {
  it("uses Zen from the home Applications folder", () => {
    const path = fallbackAppPath(
      "app.zen-browser.zen",
      "/Users/me",
      (candidate) => candidate === "/Users/me/Applications/Zen.app",
    );
    assert.equal(path, "/Users/me/Applications/Zen.app");
  });

  it("maps the Helium helper onto Helium.app", () => {
    const path = fallbackAppPath(
      "net.imput.helium.helper",
      "/Users/me",
      (candidate) => candidate === "/Applications/Helium.app",
    );
    assert.equal(path, "/Applications/Helium.app");
  });

  it("is empty when that browser is not installed", () => {
    assert.equal(fallbackAppPath("com.apple.Safari", "/Users/me", () => false), "");
  });
});

describe("listRowIcon", () => {
  it("uses the browser app icon when a path is known", () => {
    assert.deepEqual(listRowIcon("/Applications/Helium.app"), {
      fileIcon: "/Applications/Helium.app",
    });
  });

  it("has no browser icon when the path is missing", () => {
    assert.equal(listRowIcon(""), null);
  });
});
