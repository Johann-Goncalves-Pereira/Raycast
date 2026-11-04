#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "ask-bridge-server.mjs");
const support = path.join(os.homedir(), "Library", "Application Support", "omnibar");
const agents = path.join(os.homedir(), "Library", "LaunchAgents");
const label = "com.johann.omnibar.ask-bridge";
const plistPath = path.join(agents, `${label}.plist`);
const log = path.join(support, "ask-bridge.log");

fs.mkdirSync(support, { recursive: true });
fs.mkdirSync(agents, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>${scriptPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;

fs.writeFileSync(plistPath, plist);
try {
  execSync(`launchctl unload ${JSON.stringify(plistPath)}`, { stdio: "ignore" });
} catch {
  // not loaded
}
execSync(`launchctl load ${JSON.stringify(plistPath)}`, { stdio: "inherit" });
console.log("Ask Bridge LaunchAgent installed:", plistPath);
console.log("Health: curl -s http://127.0.0.1:17834/health");
