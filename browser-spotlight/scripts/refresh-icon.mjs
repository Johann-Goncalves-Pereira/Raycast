#!/usr/bin/env node
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sourceIcon = path.join(root, "assets", "icon.png");
const manifestIcon = path.join(root, "assets", "spotlight-icon.png");
const raycastAssets = path.join(os.homedir(), ".config", "raycast", "extensions", "browser-spotlight", "assets");

function ensure512(iconPath) {
  const out = execSync(`sips -g pixelWidth -g pixelHeight "${iconPath}"`, { encoding: "utf8" });
  const w = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0);
  const h = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0);
  if (w !== 512 || h !== 512) {
    execSync(`sips -z 512 512 "${iconPath}"`, { stdio: "inherit" });
    console.log(`Resized ${path.basename(iconPath)} to 512x512`);
  }
}

if (!fs.existsSync(sourceIcon)) {
  throw new Error(`Missing ${sourceIcon}`);
}

ensure512(sourceIcon);
fs.copyFileSync(sourceIcon, manifestIcon);

if (fs.existsSync(raycastAssets)) {
  fs.copyFileSync(manifestIcon, path.join(raycastAssets, "spotlight-icon.png"));
  fs.copyFileSync(manifestIcon, path.join(raycastAssets, "icon.png"));
  const variants = path.join(raycastAssets, ".raycast");
  if (fs.existsSync(variants)) {
    fs.rmSync(variants, { recursive: true, force: true });
    console.log("Cleared Raycast icon variants cache");
  }
}

execSync("npx ray build -e dist", { cwd: root, stdio: "inherit" });
console.log("Icon synced. If Raycast still shows the old purple icon, run:");
console.log("Raycast → Browser Spotlight → Actions (⌘K) → Development → Clear Local Assets Cache");
