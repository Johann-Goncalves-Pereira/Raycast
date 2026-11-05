export type Tab = {
  title: string;
  url: string;
  domain: string;
  windowId: string;
  tabId: string;
};

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function classifyInput(query: string): {
  kind: "url" | "search";
  value: string;
} {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kind: "search", value: "" };
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return { kind: "url", value: trimmed };
  }

  if (
    /^localhost(:\d+)?(\/.*)?$/i.test(trimmed) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(trimmed)
  ) {
    return { kind: "url", value: `http://${trimmed}` };
  }

  // Looks like a domain or path with a TLD and no spaces
  if (!/\s/.test(trimmed) && /^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return { kind: "url", value: `https://${trimmed}` };
  }

  return { kind: "search", value: trimmed };
}

export function buildSearchUrl(
  query: string,
  engine: "google" | "duckduckgo" | "bing",
): string {
  const encoded = encodeURIComponent(query);
  switch (engine) {
    case "bing":
      return `https://www.bing.com/search?q=${encoded}`;
    case "duckduckgo":
      return `https://duckduckgo.com/?q=${encoded}`;
    case "google":
    default:
      return `https://www.google.com/search?q=${encoded}`;
  }
}
