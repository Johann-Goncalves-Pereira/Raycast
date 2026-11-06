#!/usr/bin/env node
/**
 * Install or update Omnibar on this Mac.
 *
 * A normal run skips the Cmd+P compile and Ask Bridge reload when those
 * pieces are already current. It publishes a new extension build only when
 * the source is newer, then stops `ray develop`. A live development watcher
 * is what pins Omnibar into the empty Raycast Development section.
 * `npm run update -- --full` rebuilds everything and still stops the watcher.
 *
 * Usage: npm run update
 */
import { execSync, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  shouldRebuildHotkey,
  shouldReloadAskBridge,
  shouldPublishBuild,
  shouldStopDevelopWatcher,
} from "./update-plan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const home = os.homedir();
const nodeBin = process.execPath;
const nodeDir = path.dirname(nodeBin);
const rayBin = path.join(
  root,
  "node_modules",
  "@raycast",
  "api",
  "bin",
  "run.js",
);
const support = path.join(home, "Library", "Application Support", "omnibar");
const agents = path.join(home, "Library", "LaunchAgents");
const uid =
  typeof process.getuid === "function"
    ? process.getuid()
    : execSync("id -u", { encoding: "utf8" }).trim();
const full = process.argv.includes("--full");

const hotkeySource = path.join(__dirname, "browser-cmd-p-hotkey.swift");
const hotkeyBinary = path.join(
  support,
  "Omnibar Cmd+P.app",
  "Contents",
  "MacOS",
  "Omnibar Cmd+P",
);
const askServer = path.join(__dirname, "ask-bridge-server.mjs");
const askLabel = "com.johann.omnibar.ask-bridge";
const askPlist = path.join(agents, `${askLabel}.plist`);
const developLabel = "com.johann.omnibar.ray-develop";
const developPlist = path.join(agents, `${developLabel}.plist`);
const builtExtension = path.join(
  home,
  ".config",
  "raycast",
  "extensions",
  "omnibar",
  "search.js",
);

function run(command) {
  execSync(command, { cwd: root, stdio: "inherit" });
}

function mtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function jobIsRunning(label) {
  try {
    const printed = execSync(`launchctl print gui/${uid}/${label}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /state = running/.test(printed);
  } catch {
    return false;
  }
}

async function askBridgeHealthy() {
  try {
    const response = await fetch("http://127.0.0.1:17834/health", {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

function writePlist(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
}

function kickstart(label, plistPath) {
  try {
    execSync(`launchctl bootout gui/${uid} ${JSON.stringify(plistPath)}`, {
      stdio: "ignore",
    });
  } catch {
    try {
      execSync(`launchctl bootout gui/${uid}/${label}`, { stdio: "ignore" });
    } catch {
      // not loaded
    }
  }
  try {
    execSync(`launchctl bootstrap gui/${uid} ${JSON.stringify(plistPath)}`, {
      stdio: "inherit",
    });
  } catch {
    // Already registered. kickstart below reloads the new plist.
  }
  try {
    execSync(`launchctl enable gui/${uid}/${label}`, { stdio: "ignore" });
  } catch {
    // already enabled
  }
  execSync(`launchctl kickstart -k gui/${uid}/${label}`, { stdio: "inherit" });
}

function newestMtime(dir) {
  if (!fs.existsSync(dir)) return null;
  let newest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      const mtime = fs.statSync(fullPath).mtimeMs;
      if (mtime > newest) newest = mtime;
    }
  }
  return newest === 0 ? null : newest;
}

function unloadDevelopWatcher() {
  try {
    execSync(`launchctl bootout gui/${uid}/${developLabel}`, {
      stdio: "ignore",
    });
  } catch {
    try {
      execSync(`launchctl bootout gui/${uid} ${JSON.stringify(developPlist)}`, {
        stdio: "ignore",
      });
    } catch {
      // not loaded
    }
  }
  if (fs.existsSync(developPlist)) fs.rmSync(developPlist);
}

function publishThenStop() {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, [rayBin, "develop", "--non-interactive"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${nodeDir}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      },
    });
    let output = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      if (output.includes("built extension successfully")) finish();
      else finish(new Error("Omnibar build timed out"));
    }, 90_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("built extension successfully")) child.kill("SIGTERM");
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => finish(error));
    child.on("exit", () => {
      if (output.includes("built extension successfully")) finish();
      else if (!settled) {
        finish(new Error("develop exited before the extension finished building"));
      }
    });
  });
}

function retireBrowserSpotlight() {
  const installed = path.join(
    home,
    ".config",
    "raycast",
    "extensions",
    "browser-spotlight",
  );
  if (!fs.existsSync(installed)) return;
  const retired = path.join(support, "retired-extensions");
  fs.mkdirSync(retired, { recursive: true });
  const destination = path.join(retired, "browser-spotlight");
  if (fs.existsSync(destination)) {
    fs.rmSync(destination, { recursive: true, force: true });
  }
  fs.renameSync(installed, destination);
  console.log("Retired Browser Spotlight from Raycast root search");
}

function retargetKarabinerDeeplink() {
  const config = path.join(home, ".config", "karabiner", "karabiner.json");
  if (!fs.existsSync(config)) return;
  const text = fs.readFileSync(config, "utf8");
  const search = "raycast://extensions/johann_goncalves_pereira/omnibar/search";
  const next = text
    .replaceAll(
      "raycast://extensions/johann_goncalves_pereira/omnibar/launch'",
      `${search}'`,
    )
    .replaceAll(
      'raycast://extensions/johann_goncalves_pereira/omnibar/launch"',
      `${search}"`,
    )
    .replaceAll(
      "raycast://extensions/johann_goncalves_pereira/omnibar/open'",
      `${search}'`,
    )
    .replaceAll(
      'raycast://extensions/johann_goncalves_pereira/omnibar/open"',
      `${search}"`,
    );
  if (next === text) return;
  fs.writeFileSync(config, next);
  console.log("Pointed the Karabiner Cmd+P rule at the search command");
}

function askPlistMatches() {
  const text = readText(askPlist);
  return text.includes(nodeBin) && text.includes(askServer);
}

if (!fs.existsSync(path.join(root, "node_modules", "@raycast", "api"))) {
  run("npm install");
}

run(
  `node ${JSON.stringify(path.join(__dirname, "sync-browser-commands.mjs"))}${full ? " --full" : ""}`,
);
retireBrowserSpotlight();
retargetKarabinerDeeplink();

if (
  shouldRebuildHotkey({
    full,
    sourceMtimeMs: mtimeMs(hotkeySource) ?? 0,
    binaryMtimeMs: mtimeMs(hotkeyBinary),
  })
) {
  run(
    `node ${JSON.stringify(path.join(__dirname, "install-cmd-p-hotkey.mjs"))} --quiet`,
  );
} else {
  console.log("Hotkey unchanged — skipped compile");
}

const reloadAsk = shouldReloadAskBridge({
  full,
  healthy: await askBridgeHealthy(),
  plistMatches: askPlistMatches(),
  serverMtimeMs: mtimeMs(askServer) ?? 0,
  plistMtimeMs: mtimeMs(askPlist),
});
if (reloadAsk) {
  run(`node ${JSON.stringify(path.join(__dirname, "install-ask-bridge.mjs"))}`);
} else {
  console.log("Ask Bridge healthy — skipped reload");
}

if (
  shouldStopDevelopWatcher({
    running: jobIsRunning(developLabel),
    plistInstalled: fs.existsSync(developPlist),
  })
) {
  unloadDevelopWatcher();
  console.log("Stopped the Raycast development watcher");
}

if (
  shouldPublishBuild({
    full,
    sourceMtimeMs: newestMtime(path.join(root, "src")) ?? 0,
    buildMtimeMs: mtimeMs(builtExtension),
  })
) {
  await publishThenStop();
  console.log("Published Omnibar and left it off the empty Raycast bar");
} else {
  console.log("Extension build is current");
}

const oldPlist = path.join(agents, "com.johann.browser-spotlight.cmd-p.plist");
if (fs.existsSync(oldPlist)) {
  try {
    execSync(
      `launchctl bootout gui/${uid}/com.johann.browser-spotlight.cmd-p`,
      {
        stdio: "ignore",
      },
    );
  } catch {
    // not loaded
  }
  fs.renameSync(oldPlist, `${oldPlist}.disabled`);
}

console.log(`
Omnibar is installed from:
  ${root}

⌘P in Helium, Safari, Zen, and Chrome opens this build.
Run \`npm run update\` again after pulling new changes.
`);
