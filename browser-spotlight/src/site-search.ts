import { Tab, domainFromUrl } from "./classify";

export type SiteEngine = {
  id: string;
  name: string;
  domains: string[];
  buildUrl: (query: string) => string;
};

export const SITE_ENGINES: SiteEngine[] = [
  {
    id: "youtube",
    name: "YouTube",
    domains: ["youtube.com", "youtu.be", "m.youtube.com"],
    buildUrl: (q) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  },
  {
    id: "github",
    name: "GitHub",
    domains: ["github.com"],
    buildUrl: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "google",
    name: "Google",
    domains: ["google.com", "www.google.com"],
    buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "reddit",
    name: "Reddit",
    domains: ["reddit.com", "www.reddit.com"],
    buildUrl: (q) =>
      `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "wikipedia",
    name: "Wikipedia",
    domains: ["wikipedia.org", "en.wikipedia.org"],
    buildUrl: (q) =>
      `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`,
  },
  {
    id: "amazon",
    name: "Amazon",
    domains: ["amazon.com", "www.amazon.com", "amazon.com.br", "amazon.co.uk"],
    buildUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  },
  {
    id: "x",
    name: "X",
    domains: ["x.com", "twitter.com"],
    buildUrl: (q) => `https://x.com/search?q=${encodeURIComponent(q)}`,
  },
];

export function findSiteEngineByDomain(domain: string): SiteEngine | undefined {
  const normalized = domain.replace(/^www\./, "").toLowerCase();
  return SITE_ENGINES.find(
    (engine) =>
      engine.domains.some(
        (d) => normalized === d || normalized.endsWith(`.${d}`),
      ) || engine.name.toLowerCase() === normalized,
  );
}

export function siteEngineFromTab(tab: Tab): SiteEngine {
  const known = findSiteEngineByDomain(tab.domain);
  if (known) return known;

  const domain = tab.domain || domainFromUrl(tab.url);
  return {
    id: `site-${domain}`,
    name: domain || "Site",
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

export function matchingSiteEngines(query: string, tabs: Tab[]): SiteEngine[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const fromCatalog = SITE_ENGINES.filter(
    (engine) =>
      engine.name.toLowerCase().includes(q) ||
      engine.domains.some((d) => d.includes(q)) ||
      engine.id.includes(q),
  );

  const fromTabs: SiteEngine[] = [];
  for (const tab of tabs) {
    if (
      !tab.domain.toLowerCase().includes(q) &&
      !tab.title.toLowerCase().includes(q)
    )
      continue;
    const engine = siteEngineFromTab(tab);
    if (
      !fromCatalog.some((e) => e.id === engine.id) &&
      !fromTabs.some((e) => e.id === engine.id)
    ) {
      fromTabs.push(engine);
    }
  }

  return [...fromCatalog, ...fromTabs].slice(0, 8);
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
    // format: [query, [suggestions...]] or [{phrase: "..."}]
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
