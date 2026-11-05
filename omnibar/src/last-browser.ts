import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export type LastBrowserHint = {
  bundleId: string;
  name?: string;
  /** Unix ms when the Cmd+P helper (or Omnibar) recorded this. */
  recordedAt: number;
};

const HINT_MAX_AGE_MS = 15_000;

export function omnibarSupportDir(): string {
  return join(homedir(), "Library", "Application Support", "omnibar");
}

export function lastBrowserHintPath(): string {
  return join(omnibarSupportDir(), "last-browser.json");
}

export function writeLastBrowserHint(hint: LastBrowserHint): void {
  const dir = omnibarSupportDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(lastBrowserHintPath(), JSON.stringify(hint), "utf8");
}

export function readLastBrowserHint(
  now: number = Date.now(),
  maxAgeMs: number = HINT_MAX_AGE_MS,
): LastBrowserHint | undefined {
  const path = lastBrowserHintPath();
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as LastBrowserHint;
    if (!parsed?.bundleId || typeof parsed.recordedAt !== "number") {
      return undefined;
    }
    if (now - parsed.recordedAt > maxAgeMs) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
