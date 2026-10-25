#!/usr/bin/env node
/**
 * Download the latest Karabiner-Elements DMG and open it for install.
 * Does NOT delete ~/.config/karabiner (your Browser Spotlight + Cmd+Tab rules stay).
 *
 * Usage: npm run reinstall-karabiner
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

const CONFIG_PATH = path.join(os.homedir(), ".config", "karabiner", "karabiner.json");
const DEST = "/tmp/Karabiner-Elements-latest.dmg";
const API = "https://api.github.com/repos/pqrs-org/Karabiner-Elements/releases/latest";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

console.log("Preserving config (if present):", CONFIG_PATH);
if (fs.existsSync(CONFIG_PATH)) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const profile = (config.profiles ?? []).find((p) => p.selected) ?? config.profiles?.[0];
  const rules = profile?.complex_modifications?.rules ?? [];
  console.log(
    "Rules kept:",
    rules.map((r) => r.description),
  );
}

console.log("Resolving latest Karabiner-Elements release…");
const release = JSON.parse(run(`curl -fsSL ${JSON.stringify(API)}`));
const asset = (release.assets ?? []).find(
  (a) => typeof a.name === "string" && a.name.endsWith(".dmg") && a.name.includes("Karabiner-Elements"),
);
if (!asset?.browser_download_url) {
  throw new Error("Could not find Karabiner-Elements DMG in latest release");
}

console.log("Tag:", release.tag_name);
console.log("Downloading:", asset.browser_download_url);
run(`curl -fL --progress-bar -o ${JSON.stringify(DEST)} ${JSON.stringify(asset.browser_download_url)}`);
console.log("Saved:", DEST, `(${fs.statSync(DEST).size} bytes)`);

console.log("Opening DMG — complete the installer (password prompt), then run: npm run fix-karabiner");
run(`open ${JSON.stringify(DEST)}`);

// Best-effort: attach and open the .pkg inside the volume
try {
  const attachOut = run(`hdiutil attach ${JSON.stringify(DEST)} -nobrowse`);
  const mountLine = attachOut
    .split("\n")
    .reverse()
    .find((line) => line.includes("/Volumes/"));
  const mount = mountLine ? mountLine.slice(mountLine.indexOf("/Volumes/")).trim() : "";
  if (mount) {
    const pkg = path.join(mount, "Karabiner-Elements.pkg");
    if (fs.existsSync(pkg)) {
      console.log("Opening installer package:", pkg);
      run(`open ${JSON.stringify(pkg)}`);
    }
  }
} catch (error) {
  console.log("Could not auto-open .pkg; use the mounted DMG window.", error instanceof Error ? error.message : error);
}