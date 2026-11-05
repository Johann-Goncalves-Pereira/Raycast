import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { omnibarSupportDir } from "./last-browser";

export type OmnibarSession = {
  searchText: string;
  /** Bang or site engine id when scoped. */
  scopedId: string | null;
  scopedKind: "bang" | "site" | null;
  updatedAt: number;
};

type SessionStore = Record<string, OmnibarSession>;

function sessionPath(): string {
  return join(omnibarSupportDir(), "sessions.json");
}

function readStore(): SessionStore {
  const path = sessionPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SessionStore;
  } catch {
    return {};
  }
}

function writeStore(store: SessionStore): void {
  const dir = omnibarSupportDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sessionPath(), JSON.stringify(store), "utf8");
}

export function loadSession(bundleId: string): OmnibarSession | undefined {
  return readStore()[bundleId];
}

export function saveSession(
  bundleId: string,
  session: Omit<OmnibarSession, "updatedAt">,
  now: number = Date.now(),
): void {
  const store = readStore();
  store[bundleId] = { ...session, updatedAt: now };
  writeStore(store);
}

export function clearSession(bundleId: string): void {
  const store = readStore();
  delete store[bundleId];
  writeStore(store);
}
