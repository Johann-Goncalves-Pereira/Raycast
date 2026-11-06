import { buildBangSearchUrl, type Bang } from "./bangs";

/** An http(s) address to open as a page. A bare host such as github.com is not one. */
export function navigableHttpUrl(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.href;
}

export type SubmitTarget =
  | { kind: "ignore" }
  | { kind: "scoped"; url: string }
  | { kind: "engine"; query: string };

/**
 * A pasted http(s) URL opens that page, including inside a bang.
 * Cmd+Enter inside a bang otherwise opens that site. An empty bang query stays put.
 * Outside a bang, typed text uses the browser's search engine.
 */
export function scopedSubmitUrl(input: {
  query: string;
  bang: Bang | null;
  site: { buildUrl: (query: string) => string } | null;
}): SubmitTarget {
  const query = input.query.trim();
  const direct = navigableHttpUrl(query);
  if (direct) return { kind: "scoped", url: direct };
  if (!query) return { kind: "ignore" };
  if (input.bang?.kind === "site") {
    return { kind: "scoped", url: buildBangSearchUrl(input.bang, query) };
  }
  if (input.site) {
    return { kind: "scoped", url: input.site.buildUrl(query) };
  }
  return { kind: "engine", query };
}
