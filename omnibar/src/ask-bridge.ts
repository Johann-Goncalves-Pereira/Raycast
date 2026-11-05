import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { omnibarSupportDir } from "./last-browser";

export const ASK_BRIDGE_PORT = 17_834;
export const ASK_BRIDGE_URL = `http://127.0.0.1:${ASK_BRIDGE_PORT}/ask`;

export type AskBridgeResponse = {
  ok: boolean;
  answer?: string;
  error?: string;
};

export async function askBridge(
  prompt: string,
  signal?: AbortSignal,
): Promise<AskBridgeResponse> {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: "Empty prompt" };

  try {
    const response = await fetch(ASK_BRIDGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: trimmed,
        provider: "antigravity",
        model: "gemini-3.8-flash",
        thinking_level: "medium",
      }),
      signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Ask Bridge HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as {
      answer?: string;
      error?: string;
    };
    if (data.error) return { ok: false, error: data.error };
    return { ok: true, answer: data.answer ?? "" };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Ask Bridge unreachable — install the LaunchAgent",
    };
  }
}

export function askBridgeLaunchAgentPlist(scriptPath: string): string {
  const label = "com.johann.omnibar.ask-bridge";
  const log = join(omnibarSupportDir(), "ask-bridge.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

/** Write LaunchAgent plist (does not load it). */
export function writeAskBridgeLaunchAgent(
  scriptPath: string = join(
    process.cwd(),
    "scripts",
    "ask-bridge-server.mjs",
  ),
): string {
  const agents = join(homedir(), "Library", "LaunchAgents");
  if (!existsSync(agents)) mkdirSync(agents, { recursive: true });
  const plistPath = join(agents, "com.johann.omnibar.ask-bridge.plist");
  writeFileSync(plistPath, askBridgeLaunchAgentPlist(scriptPath), "utf8");
  return plistPath;
}

export function loadAskBridgeLaunchAgent(plistPath: string): void {
  try {
    execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  } catch {
    // not loaded
  }
  execFileSync("launchctl", ["load", plistPath], { encoding: "utf8" });
}
