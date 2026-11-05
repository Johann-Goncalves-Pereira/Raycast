const TRACKING_PARAM_EXACT = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "yclid",
  "twclid",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "source",
  "si",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith("utm_")) return true;
  if (TRACKING_PARAM_EXACT.has(lower)) return true;
  return false;
}

/** Strip known tracking / marketing query params (Arc Supercopy). */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const kept: string[] = [];
    parsed.searchParams.forEach((value, key) => {
      if (!isTrackingParam(key)) {
        kept.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    });
    parsed.search = kept.length > 0 ? `?${kept.join("&")}` : "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function sanitizeUrls(urls: readonly string[]): string {
  return urls.map(sanitizeUrl).join("\n");
}

export function formatMarkdownLink(title: string, url: string): string {
  const clean = sanitizeUrl(url);
  const safeTitle = title.replace(/[\[\]]/g, "");
  return `[${safeTitle || clean}](${clean})`;
}
