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

/** Session written after Enter sends a query, tab, or URL to the browser. */
export function clearedSession(): Omit<OmnibarSession, "updatedAt"> {
  return { searchText: "", scopedId: null, scopedKind: null };
}

/** A draft older than this opens as an empty bar. */
export const CLEAN_SLATE_AFTER_MS = 2_000;

/** Fields to show when Omnibar switches to `prior`'s browser. Missing means empty. */
export function sessionFields(
  prior: OmnibarSession | undefined,
): Omit<OmnibarSession, "updatedAt"> {
  if (!prior) return clearedSession();
  return {
    searchText: prior.searchText,
    scopedId: prior.scopedId,
    scopedKind: prior.scopedKind,
  };
}

/** Reopening after two seconds drops the draft. A quicker reopen keeps it. */
export function sessionForOpen(input: {
  session: OmnibarSession | undefined;
  now: number;
  maxAgeMs?: number;
}): Omit<OmnibarSession, "updatedAt"> {
  const session = input.session;
  if (!session) return clearedSession();
  const maxAge = input.maxAgeMs ?? CLEAN_SLATE_AFTER_MS;
  if (input.now - session.updatedAt >= maxAge) return clearedSession();
  return sessionFields(session);
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
