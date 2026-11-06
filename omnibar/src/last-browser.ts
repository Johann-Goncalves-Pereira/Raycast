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

/**
 * A Cmd+P hint should replace the mounted browser when its timestamp or
 * bundle id changed. The same hint must not retrigger a resolve.
 */
/**
 * A stamp written before this Omnibar open is not a keypress. Only a stamp
 * newer than `openedAt` runs, and the same stamp runs once.
 */
export function freshStamp(
  openedAt: number,
  seen: number | undefined,
  onDisk: number | undefined,
): { seen: number | undefined; run: boolean } {
  if (onDisk == null || onDisk <= openedAt) {
    return { seen: onDisk ?? seen, run: false };
  }
  if (seen === onDisk) return { seen, run: false };
  return { seen: onDisk, run: true };
}

/** Cmd+Enter while Omnibar is open should run once per new submit stamp. */
export function shouldRunSubmit(
  previous: number | undefined,
  next: number | undefined,
  query: string,
): boolean {
  if (next == null || query.trim().length === 0) return false;
  return previous !== next;
}

/** Tab while Omnibar is open should scope once per new stamp. */
export function shouldRunTab(
  previous: number | undefined,
  next: number | undefined,
): boolean {
  if (next == null) return false;
  return previous !== next;
}

export function shouldApplyBrowserHint(
  current: { bundleId: string; recordedAt: number } | undefined,
  next: LastBrowserHint | undefined,
): boolean {
  if (!next?.bundleId || typeof next.recordedAt !== "number") return false;
  if (!current) return true;
  return (
    next.recordedAt !== current.recordedAt || next.bundleId !== current.bundleId
  );
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
