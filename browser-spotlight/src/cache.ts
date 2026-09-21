/** Minimal store interface so unit tests can inject a Map. */
export type CacheStore = {
  get(key: string): string | undefined;
  set(key: string, data: string): void;
  remove(key: string): boolean;
};

export type CacheEntry<T> = {
  data: T;
  cachedAt: number;
};

export const TTL = {
  tabs: 3_000,
  history: 30_000,
  engines: 5 * 60_000,
  extensions: 5 * 60_000,
} as const;

let defaultStore: CacheStore | undefined;

function memoryStore(): CacheStore {
  const map = new Map<string, string>();
  return {
    get(key) {
      return map.get(key);
    },
    set(key, data) {
      map.set(key, data);
    },
    remove(key) {
      return map.delete(key);
    },
  };
}

function getDefaultStore(): CacheStore {
  if (!defaultStore) {
    try {
      // Lazy require so unit tests outside Raycast don't need @raycast/api.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Cache } = require("@raycast/api") as typeof import("@raycast/api");
      defaultStore = new Cache({ namespace: "browser-spotlight" });
    } catch {
      defaultStore = memoryStore();
    }
  }
  return defaultStore;
}

/** Override the backing store (tests). Pass `undefined` to reset. */
export function setCacheStore(store: CacheStore | undefined): void {
  defaultStore = store;
}

export function cacheKey(
  kind: "tabs" | "history" | "engines" | "extensions" | "suggestions",
  bundleIdOrQuery: string,
  extra?: string,
): string {
  return extra
    ? `${kind}:${bundleIdOrQuery}:${extra}`
    : `${kind}:${bundleIdOrQuery}`;
}

export function readCacheEntry<T>(
  key: string,
  store: CacheStore = getDefaultStore(),
): CacheEntry<T> | undefined {
  const raw = store.get(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.cachedAt !== "number" ||
      !("data" in parsed)
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Return cached data if present and younger than `maxAgeMs`.
 * When fresh, callers can skip expensive disk/AppleScript work.
 */
export function readFresh<T>(
  key: string,
  maxAgeMs: number,
  store: CacheStore = getDefaultStore(),
  now: number = Date.now(),
): T | undefined {
  const entry = readCacheEntry<T>(key, store);
  if (!entry) return undefined;
  if (now - entry.cachedAt > maxAgeMs) return undefined;
  return entry.data;
}

export function writeCache<T>(
  key: string,
  data: T,
  store: CacheStore = getDefaultStore(),
  now: number = Date.now(),
): void {
  const entry: CacheEntry<T> = { data, cachedAt: now };
  store.set(key, JSON.stringify(entry));
}

/** Read any cached data regardless of age (for stale-while-revalidate paint). */
export function readStale<T>(
  key: string,
  store: CacheStore = getDefaultStore(),
): T | undefined {
  return readCacheEntry<T>(key, store)?.data;
}
