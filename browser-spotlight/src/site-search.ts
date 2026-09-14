import { Tab, domainFromUrl } from "./classify";
import { expandSearchUrl, getBrowserSearchEngines } from "./browser-engines";
import { BrowserDefinition } from "./browsers";

export type SiteEngine = {
  id: string;
  name: string;
  /** Omnibox / site-search shortcuts (e.g. youtube.com, yt, g). */
  keywords: string[];
  domains: string[];
  buildUrl: (query: string) => string;
  color?: string;
};

/** Small fallback when the browser has no readable keyword DB (e.g. Safari). */
export const FALLBACK_SITE_ENGINES: SiteEngine[] = [
  {
    id: "youtube",
    name: "YouTube",
    keywords: ["yt", "you", "youtube", "youtube.com"],
    domains: ["youtube.com", "youtu.be"],
    color: "#FF0000",
    buildUrl: (q) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  },
  {
    id: "github",
    name: "GitHub",
    keywords: ["gh", "github", "github.com"],
    domains: ["github.com"],
    buildUrl: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "google",
    name: "Google",
    keywords: ["g", "google", "google.com"],
    domains: ["google.com"],
    buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
];

export function loadSiteEngines(
  browser: BrowserDefinition | null,
): SiteEngine[] {
  if (!browser) return FALLBACK_SITE_ENGINES;
  const fromBrowser = getBrowserSearchEngines(browser).map((engine) => ({
    id: engine.id,
    name: engine.name,
    keywords: engine.keywords,
    domains: engine.domains,
    buildUrl: (q: string) => expandSearchUrl(engine.urlTemplate, q),
  }));
  return fromBrowser.length > 0 ? fromBrowser : FALLBACK_SITE_ENGINES;
}

function engineAliases(engine: SiteEngine): string[] {
  return [
    engine.id.toLowerCase(),
    engine.name.toLowerCase(),
    ...engine.keywords.map((k) => k.toLowerCase()),
    ...engine.domains.map((d) => d.replace(/^www\./, "").toLowerCase()),
  ];
}

/**
 * Chrome/Arc omnibox behavior: a single token that uniquely identifies a
 * site/search engine (exact keyword, or unique prefix) → Tab scopes to it.
 */
export function resolveEngineKeyword(
  query: string,
  engines: SiteEngine[],
): SiteEngine | null {
  const q = query.trim().toLowerCase();
  if (!q || /\s/.test(q)) return null;

  const exact = engines.find((engine) =>
    engineAliases(engine).some((alias) => alias === q),
  );
  if (exact) return exact;

  const prefixMatches = engines.filter((engine) =>
    engineAliases(engine).some((alias) => alias.startsWith(q)),
  );
  if (prefixMatches.length === 1) return prefixMatches[0];

  if (prefixMatches.length > 1) {
    const scored = prefixMatches
      .map((engine) => {
        const aliases = engineAliases(engine).filter((a) => a.startsWith(q));
        const best = Math.min(...aliases.map((a) => a.length));
        return { engine, best };
      })
      .sort((a, b) => a.best - b.best);
    if (scored[0].best < scored[1].best) return scored[0].engine;
  }

  return null;
}

export function findSiteEngineByDomain(
  domain: string,
  engines: SiteEngine[],
): SiteEngine | undefined {
  const normalized = domain.replace(/^www\./, "").toLowerCase();
  return engines.find(
    (engine) =>
      engine.domains.some(
        (d) => normalized === d || normalized.endsWith(`.${d}`),
      ) || engine.name.toLowerCase() === normalized,
  );
}

export function siteEngineFromTab(
  tab: Tab,
  engines: SiteEngine[] = [],
): SiteEngine {
  const known = findSiteEngineByDomain(tab.domain, engines);
  if (known) return known;

  const domain = tab.domain || domainFromUrl(tab.url);
  return {
    id: `site-${domain}`,
    name: domain || "Site",
    keywords: [domain],
    domains: [domain],
    buildUrl: (q) => {
      try {
        const url = new URL(tab.url);
        return `${url.origin}/search?q=${encodeURIComponent(q)}`;
      } catch {
        return `https://${domain}/search?q=${encodeURIComponent(q)}`;
      }
    },
  };
}

export function matchingSiteEngines(
  query: string,
  engines: SiteEngine[],
  tabs: Tab[],
): SiteEngine[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const keyword = resolveEngineKeyword(query, engines);

  const fromCatalog = engines.filter(
    (engine) =>
      engine.name.toLowerCase().includes(q) ||
      engine.domains.some((d) => d.includes(q)) ||
      engine.id.toLowerCase().includes(q) ||
      engine.keywords.some(
        (k) => k.toLowerCase().includes(q) || q.startsWith(k.toLowerCase()),
      ),
  );

  const fromTabs: SiteEngine[] = [];
  for (const tab of tabs) {
    if (
      !tab.domain.toLowerCase().includes(q) &&
      !tab.title.toLowerCase().includes(q)
    )
      continue;
    const engine = siteEngineFromTab(tab, engines);
    if (
      !fromCatalog.some((e) => e.id === engine.id) &&
      !fromTabs.some((e) => e.id === engine.id)
    ) {
      fromTabs.push(engine);
    }
  }

  const merged = [...fromCatalog, ...fromTabs];
  if (keyword) {
    return [keyword, ...merged.filter((e) => e.id !== keyword.id)].slice(0, 12);
  }
  return merged.slice(0, 12);
}

export async function fetchDuckDuckGoSuggestions(
  query: string,
): Promise<string[]> {
  if (!query.trim()) return [];
  try {
    const response = await fetch(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as unknown;
    if (Array.isArray(data)) {
      if (Array.isArray(data[1])) {
        return (data[1] as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 8);
      }
      return data
        .map((item) =>
          typeof item === "object" && item && "phrase" in item
            ? String((item as { phrase: string }).phrase)
            : null,
        )
        .filter((s): s is string => Boolean(s))
        .slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchYouTubeSuggestions(
  query: string,
): Promise<string[]> {
  if (!query.trim()) return [];
  try {
    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as unknown;
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return (data[1] as unknown[])
        .filter((s): s is string => typeof s === "string")
        .slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

export function isYouTubeEngine(engine: SiteEngine): boolean {
  return (
    engine.domains.some((d) => d.includes("youtube")) ||
    engine.keywords.some((k) => k.includes("youtube") || k === "yt") ||
    engine.name.toLowerCase().includes("youtube")
  );
}
