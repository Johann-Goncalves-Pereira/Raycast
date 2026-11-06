export type AppRef = {
  name: string;
  path: string;
  bundleId?: string;
};

/** Cmd+P focuses Raycast first, so the hint app often has an empty path. */
export function preferInstalledAppPath(
  app: AppRef,
  installed: readonly AppRef[],
): AppRef {
  if (app.path) return app;
  const hit = installed.find(
    (item) => item.bundleId && item.bundleId === app.bundleId && item.path,
  );
  if (!hit) return app;
  return { ...app, path: hit.path, name: app.name || hit.name };
}

/** Browser application icon for list rows and the search-bar chip. */
export function listRowIcon(appPath: string): { fileIcon: string } | null {
  if (!appPath) return null;
  return { fileIcon: appPath };
}

const FALLBACK_APP_CANDIDATES: Record<string, readonly string[]> = {
  "com.google.Chrome": ["/Applications/Google Chrome.app"],
  "com.google.Chrome.canary": ["/Applications/Google Chrome Canary.app"],
  "com.google.Chrome.dev": ["/Applications/Google Chrome Dev.app"],
  "com.apple.Safari": ["/Applications/Safari.app"],
  "com.apple.SafariTechnologyPreview": [
    "/Applications/Safari Technology Preview.app",
  ],
  "company.thebrowser.Browser": ["/Applications/Arc.app"],
  "company.thebrowser.dia": ["/Applications/Dia.app"],
  "net.imput.helium": ["/Applications/Helium.app"],
  "app.zen-browser.zen": ["~/Applications/Zen.app", "/Applications/Zen.app"],
  "com.brave.Browser": ["/Applications/Brave Browser.app"],
  "com.microsoft.edgemac": ["/Applications/Microsoft Edge.app"],
  "com.vivaldi.Vivaldi": ["/Applications/Vivaldi.app"],
  "com.operasoftware.Opera": ["/Applications/Opera.app"],
  "com.kagi.kagimacOS": ["/Applications/Orion.app"],
  "org.chromium.Chromium": ["/Applications/Chromium.app"],
};

/** Path Raycast can show when `getApplications` did not fill one in. */
export function fallbackAppPath(
  bundleId: string | undefined,
  home: string,
  exists: (path: string) => boolean,
): string {
  const id =
    bundleId === "net.imput.helium.helper" ? "net.imput.helium" : bundleId;
  if (!id) return "";
  for (const candidate of FALLBACK_APP_CANDIDATES[id] ?? []) {
    const path = candidate.replace(/^~(?=\/)/, home);
    if (exists(path)) return path;
  }
  return "";
}
