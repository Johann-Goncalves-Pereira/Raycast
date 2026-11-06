/**
 * Write one entry file and command icon per browser, then point package.json
 * at those commands. Icons are copied from the installed .app when it exists.
 *
 * Usage: node scripts/sync-browser-commands.mjs [--full]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldExtractIcon } from "./app-icon-extract.mjs";
import {
  commandEntries,
  commandIconPath,
  parseCatalog,
} from "./browser-command-manifest.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const catalogPath = path.join(root, "src", "browser-catalog.ts");
const commandsJson = path.join(root, "src", "browser-commands.json");
const assetsDir = path.join(root, "assets", "browsers");
const srcDir = path.join(root, "src");

function findApp(bundleId) {
  try {
    const out = execFileSync(
      "/usr/bin/mdfind",
      [`kMDItemCFBundleIdentifier == "${bundleId}"`],
      { encoding: "utf8" },
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.endsWith(".app"));
  } catch {
    return undefined;
  }
}

function iconFileName(id) {
  return path.basename(commandIconPath(id));
}

function extractIcon(bundleId, id) {
  const destination = path.join(assetsDir, iconFileName(id));
  if (!shouldExtractIcon(id, fs.existsSync(destination), full)) {
    return fs.existsSync(destination);
  }
  const appPath = findApp(bundleId);
  if (!appPath) return fs.existsSync(destination);
  fs.mkdirSync(assetsDir, { recursive: true });
  try {
    execFileSync(
      "swift",
      [
        path.join(root, "scripts", "render-app-icon.swift"),
        appPath,
        destination,
      ],
      { stdio: "inherit" },
    );
    return fs.existsSync(destination);
  } catch (error) {
    console.error(`Could not extract ${id} icon: ${error}`);
    return fs.existsSync(destination);
  }
}

function writeEntry(name, from) {
  const file = path.join(srcDir, `${name}.tsx`);
  const body = `export { default } from "./${from}";\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === body) return;
  fs.writeFileSync(file, body);
}

const browsers = parseCatalog(fs.readFileSync(catalogPath, "utf8"));
const commandByBundle = JSON.parse(fs.readFileSync(commandsJson, "utf8"));
const wanted = new Set(
  Object.values(commandByBundle)
    .filter((name) => name.startsWith("cmd-"))
    .map((name) => name.slice("cmd-".length)),
);
const selected = browsers.filter((browser) => wanted.has(browser.id));
if (selected.length === 0) {
  console.error("No browser icon commands in browser-commands.json");
  process.exit(1);
}

const iconsOnDisk = new Set();
const keep = new Set(["sync-browser-exclusions.tsx"]);
for (const browser of selected) {
  if (extractIcon(browser.bundleId, browser.id)) {
    iconsOnDisk.add(commandIconPath(browser.id));
  }
  keep.add(`cmd-${browser.id}.tsx`);
  writeEntry(`cmd-${browser.id}`, "search");
}
writeEntry("sync-browser-exclusions", "apply-exclusions");
for (const file of fs.readdirSync(srcDir)) {
  if (!/^(open-.+|launch|cmd-.+)\.tsx$/.test(file)) continue;
  if (keep.has(file)) continue;
  fs.unlinkSync(path.join(srcDir, file));
}

const packagePath = path.join(root, "package.json");
const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
manifest.commands = commandEntries(selected, iconsOnDisk);
fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);

const support = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "omnibar",
);
fs.mkdirSync(support, { recursive: true });
fs.copyFileSync(commandsJson, path.join(support, "browser-commands.json"));

console.log(
  `Synced ${selected.length} browser commands (${iconsOnDisk.size} icons).`,
);
