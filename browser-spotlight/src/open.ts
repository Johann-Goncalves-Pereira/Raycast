import { Application, getPreferenceValues, open } from "@raycast/api";
import { ExtensionPreferences } from "./browsers";
import { buildSearchUrl, classifyInput } from "./classify";

export async function openInBrowser(
  app: Application,
  target: string,
): Promise<void> {
  await open(target, app);
}

export async function openQueryInBrowser(
  app: Application,
  query: string,
): Promise<void> {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const classified = classifyInput(query);
  if (classified.kind === "url") {
    await openInBrowser(app, classified.value);
    return;
  }
  const engine =
    (prefs.searchEngine as "google" | "duckduckgo" | "bing") || "google";
  await openInBrowser(app, buildSearchUrl(classified.value, engine));
}
