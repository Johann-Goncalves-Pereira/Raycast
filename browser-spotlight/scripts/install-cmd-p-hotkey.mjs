#!/usr/bin/env node
/**
 * Install a Karabiner-free Cmd+P remapper for browsers (CGEvent tap).
 * Packages as a signed .app so macOS Accessibility TCC sticks reliably.
 *
 * Usage: npm run install-cmd-p-hotkey
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const SUPPORT = path.join(HOME, "Library", "Application Support", "browser-spotlight");
const APP_NAME = "Browser Spotlight Cmd+P.app";
const APP = path.join(SUPPORT, APP_NAME);
const MACOS_DIR = path.join(APP, "Contents", "MacOS");
const BIN = path.join(MACOS_DIR, "Browser Spotlight Cmd+P");
const SOURCE = path.join(__dirname, "browser-cmd-p-hotkey.swift");
const LAUNCH_AGENTS = path.join(HOME, "Library", "LaunchAgents");
const PLIST = path.join(LAUNCH_AGENTS, "com.johann.browser-spotlight.cmd-p.plist");
const LABEL = "com.johann.browser-spotlight.cmd-p";
const BUNDLE_ID = "com.johann.browser-spotlight.cmd-p";

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

fs.mkdirSync(MACOS_DIR, { recursive: true });
fs.mkdirSync(LAUNCH_AGENTS, { recursive: true });

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Browser Spotlight Cmd+P</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>Browser Spotlight Cmd+P</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;

fs.writeFileSync(path.join(APP, "Contents", "Info.plist"), infoPlist);

console.log("Compiling event-tap hotkey into .app…");
run(`swiftc -O -o ${JSON.stringify(BIN)} ${JSON.stringify(SOURCE)}`);
fs.chmodSync(BIN, 0o755);

console.log("Ad-hoc codesigning…");
try {
  run(`codesign --force --deep --sign - ${JSON.stringify(APP)}`);
} catch (error) {
  console.warn("codesign warning:", error instanceof Error ? error.message : error);
}

console.log("App:", APP);

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BIN}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(SUPPORT, "cmd-p-hotkey.log")}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(SUPPORT, "cmd-p-hotkey.err.log")}</string>
</dict>
</plist>
`;

fs.writeFileSync(PLIST, plist);

// Clear stale logs
fs.writeFileSync(path.join(SUPPORT, "cmd-p-hotkey.err.log"), "");
fs.writeFileSync(path.join(SUPPORT, "cmd-p-hotkey.log"), "");

try {
  run(`launchctl bootout gui/$(id -u) ${JSON.stringify(PLIST)}`);
} catch {
  // not loaded
}

run(`launchctl bootstrap gui/$(id -u) ${JSON.stringify(PLIST)}`);
run(`launchctl enable gui/$(id -u)/${LABEL}`);
run(`launchctl kickstart -k gui/$(id -u)/${LABEL}`);

console.log(`
Installed as: ${APP}

IMPORTANT — re-authorize after packaging as .app:
1. System Settings → Privacy & Security → Accessibility
   - Find "Browser Spotlight Cmd+P"
   - Toggle it OFF, then ON again (required after every rebuild)
   - If missing: Click + and add: ${APP}
2. System Settings → Privacy & Security → Input Monitoring
   - Same app → OFF then ON (or add it)
3. Then run:
   launchctl kickstart -k gui/$(id -u)/com.johann.browser-spotlight.cmd-p
4. Confirm log shows "hotkey running (Carbon)":
   tail -f ${path.join(SUPPORT, "cmd-p-hotkey.err.log")}
5. Focus Helium → ⌘P → Browser Spotlight
`);

try {
  execSync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"', {
    stdio: "ignore",
  });
} catch {
  // ignore
}
try {
  execSync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"', {
    stdio: "ignore",
  });
} catch {
  // ignore
}
try {
  execSync(`open -R ${JSON.stringify(APP)}`, { stdio: "ignore" });
} catch {
  // ignore
}
