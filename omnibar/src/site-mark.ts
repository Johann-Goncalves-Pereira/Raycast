import type { Image } from "@raycast/api";

/** Brand colors Raycast can paint on a bang tag. The list window has no background API. */
const BRAND_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  github: "#58A6FF",
  google: "#4285F4",
  duckduckgo: "#DE5833",
  wikipedia: "#636466",
  twitter: "#1D9BF0",
  reddit: "#FF4500",
  amazon: "#FF9900",
  yahoo: "#6001D2",
};

export const SQUIRCLE_MASK: Image.Mask = "roundedRectangle" as Image.Mask;

export type SiteIcon = {
  source: string;
  mask: Image.Mask;
};

function hostKey(domain: string): string {
  const host = domain.trim().replace(/^www\./i, "").toLowerCase();
  return host.split(".")[0] ?? "";
}

export function faviconUrl(domain: string): string {
  const host = domain.trim().replace(/^www\./i, "");
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

export function brandColor(
  id: string,
  domains: readonly string[],
  explicit?: string,
): string {
  const chosen = explicit?.trim();
  if (chosen) return chosen;
  const keys = [id.toLowerCase(), ...domains.map(hostKey)];
  for (const key of keys) {
    const color = BRAND_COLORS[key];
    if (color) return color;
  }
  return hueFromKey(id || domains[0] || "site");
}

export function hueFromKey(key: string): string {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return `hsl(${hash % 360}, 70%, 55%)`;
}

/** Favicon shown on the right of the history clock for one history link. */
export function historyLinkLogo(domain: string): SiteIcon | null {
  return siteIcon([domain]);
}

export function siteIcon(
  domains: readonly string[],
): SiteIcon | null {
  const domain = domains.find((item) => item.trim().length > 0);
  if (!domain) return null;
  return { source: faviconUrl(domain), mask: SQUIRCLE_MASK };
}
