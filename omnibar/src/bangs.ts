import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { omnibarSupportDir } from "./last-browser";
import type { SiteEngine } from "./site-search";

export type BangKind = "site" | "ask";

export type Bang = {
  id: string;
  /** Canonical display trigger, e.g. `@YouTube` or `@Ask`. */
  trigger: string;
  name: string;
  domains: string[];
  kind: BangKind;
  /** Search URL with `{searchTerms}` or `%s`. */
  urlTemplate?: string;
};

export type BangUsage = {
  count: number;
  lastUsedAt: number;
};

export type BangUsageMap = Record<string, BangUsage>;

/** Unduck/DDG-compatible fallback bangs + first-class @Ask. */
export const FALLBACK_BANGS: Bang[] = [
  {
    id: "ask",
    trigger: "@Ask",
    name: "Ask",
    domains: [],
    kind: "ask",
  },
  {
    id: "youtube",
    trigger: "@YouTube",
    name: "YouTube",
    domains: ["youtube.com", "youtu.be"],
    kind: "site",
    urlTemplate: "https://www.youtube.com/results?search_query={searchTerms}",
  },
  {
    id: "github",
    trigger: "@GitHub",
    name: "GitHub",
    domains: ["github.com"],
    kind: "site",
    urlTemplate: "https://github.com/search?q={searchTerms}",
  },
  {
    id: "google",
    trigger: "@Google",
    name: "Google",
    domains: ["google.com"],
    kind: "site",
    urlTemplate: "https://www.google.com/search?q={searchTerms}",
  },
  {
    id: "duckduckgo",
    trigger: "@DuckDuckGo",
    name: "DuckDuckGo",
    domains: ["duckduckgo.com"],
    kind: "site",
    urlTemplate: "https://duckduckgo.com/?q={searchTerms}",
  },
  {
    id: "wikipedia",
    trigger: "@Wikipedia",
    name: "Wikipedia",
    domains: ["wikipedia.org"],
    kind: "site",
    urlTemplate: "https://en.wikipedia.org/w/index.php?search={searchTerms}",
  },
  {
    id: "twitter",
    trigger: "@Twitter",
    name: "Twitter / X",
    domains: ["twitter.com", "x.com"],
    kind: "site",
    urlTemplate: "https://x.com/search?q={searchTerms}",
  },
  {
    id: "reddit",
    trigger: "@Reddit",
    name: "Reddit",
    domains: ["reddit.com"],
    kind: "site",
    urlTemplate: "https://www.reddit.com/search/?q={searchTerms}",
  },
  {
    id: "amazon",
    trigger: "@Amazon",
    name: "Amazon",
    domains: ["amazon.com"],
    kind: "site",
    urlTemplate: "https://www.amazon.com/s?k={searchTerms}",
  },
  {
    id: "yahoo",
    trigger: "@Yahoo",
    name: "Yahoo",
    domains: ["yahoo.com"],
    kind: "site",
    urlTemplate: "https://search.yahoo.com/search?p={searchTerms}",
  },
];

function usagePath(): string {
  return join(omnibarSupportDir(), "bang-usage.json");
}

export function readBangUsage(): BangUsageMap {
  const path = usagePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BangUsageMap;
  } catch {
    return {};
  }
}

export function writeBangUsage(map: BangUsageMap): void {
  const dir = omnibarSupportDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(usagePath(), JSON.stringify(map), "utf8");
}

export function bumpBangUsage(
  bangId: string,
  now: number = Date.now(),
  map: BangUsageMap = readBangUsage(),
): BangUsageMap {
  const prev = map[bangId] ?? { count: 0, lastUsedAt: 0 };
  const next: BangUsageMap = {
    ...map,
    [bangId]: { count: prev.count + 1, lastUsedAt: now },
  };
  writeBangUsage(next);
  return next;
}

export function bangScore(usage: BangUsage | undefined, now: number): number {
  if (!usage) return 0;
  const ageHours = Math.max(0, (now - usage.lastUsedAt) / 3_600_000);
  const recency = Math.exp(-ageHours / 72); // ~3-day half-life feel
  return usage.count * 10 + recency * 5;
}

export function bangsFromSiteEngines(engines: SiteEngine[]): Bang[] {
  return engines.map((engine) => ({
    id: engine.id,
    trigger: `@${engine.name.replace(/\s+/g, "")}`,
    name: engine.name,
    domains: engine.domains,
    kind: "site" as const,
    urlTemplate: engine.urlTemplate,
  }));
}

export function mergeBangCatalog(
  siteEngines: SiteEngine[],
  fallback: Bang[] = FALLBACK_BANGS,
): Bang[] {
  const fromSites = bangsFromSiteEngines(siteEngines);
  const byId = new Map<string, Bang>();
  for (const bang of fallback) byId.set(bang.id.toLowerCase(), bang);
  for (const bang of fromSites) {
    const key = bang.id.toLowerCase();
    const existing = byId.get(key);
    byId.set(key, existing ? { ...existing, ...bang, kind: "site" } : bang);
  }
  // Always keep @Ask
  const ask = fallback.find((b) => b.kind === "ask");
  if (ask) byId.set("ask", ask);
  return [...byId.values()];
}

function bangAliases(bang: Bang): string[] {
  return [
    bang.id.toLowerCase(),
    bang.name.toLowerCase(),
    bang.trigger.toLowerCase().replace(/^@/, ""),
    ...bang.domains.map((d) => d.replace(/^www\./, "").toLowerCase()),
  ];
}

export function rankBangs(
  bangs: Bang[],
  usage: BangUsageMap,
  now: number = Date.now(),
): Bang[] {
  return [...bangs].sort((a, b) => {
    const diff = bangScore(usage[b.id], now) - bangScore(usage[a.id], now);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Tab on a single token completes to that bang.
 * `You` → `@YouTube`. Multi-word queries and `/` commands stay as typed.
 */
export function bangForTab(
  query: string,
  bangs: readonly Bang[],
  usage: BangUsageMap = {},
  now: number = Date.now(),
): Bang | undefined {
  const token = query.trim();
  if (!token || /\s/.test(token) || token.startsWith("/") || token === "@") {
    return undefined;
  }
  return resolveBangPrefix(token, [...bangs], usage, now);
}

/** Prefix match after optional `@`, frequency-ranked. */
export function resolveBangPrefix(
  token: string,
  bangs: Bang[],
  usage: BangUsageMap = {},
  now: number = Date.now(),
): Bang | undefined {
  const raw = token.trim();
  if (!raw) return undefined;
  const q = raw.replace(/^@/, "").toLowerCase();
  if (!q) return undefined;

  const ranked = rankBangs(bangs, usage, now);
  const exact = ranked.find((bang) =>
    bangAliases(bang).some((alias) => alias === q),
  );
  if (exact) return exact;

  const prefix = ranked.filter((bang) =>
    bangAliases(bang).some((alias) => alias.startsWith(q)),
  );
  return prefix[0];
}

export function parseBangQuery(query: string): {
  bangToken: string | null;
  rest: string;
  listingAll: boolean;
} {
  const trimmed = query.trimStart();
  if (!trimmed.startsWith("@")) {
    return { bangToken: null, rest: query, listingAll: false };
  }
  if (trimmed === "@") {
    return { bangToken: "", rest: "", listingAll: true };
  }
  const match = trimmed.match(/^@([^\s]*)(?:\s+([\s\S]*))?$/);
  if (!match) return { bangToken: null, rest: query, listingAll: false };
  return {
    bangToken: match[1] ?? "",
    rest: (match[2] ?? "").trimStart(),
    listingAll: false,
  };
}

export function bangItemId(id: string): string {
  return `bang-${id}`;
}

export function historyItemId(url: string): string {
  return `history-${url}`;
}

export function buildBangSearchUrl(bang: Bang, query: string): string {
  const template =
    bang.urlTemplate ??
    `https://duckduckgo.com/?q=${encodeURIComponent(`!${bang.id} `)}{searchTerms}`;
  const encoded = encodeURIComponent(query);
  return template
    .replaceAll("{searchTerms}", encoded)
    .replaceAll("%s", encoded);
}
