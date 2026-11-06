/**
 * Cmd+P commands stay enabled, because a disabled Raycast command cannot be
 * opened from a deeplink. The exclusions command stays out of root search.
 */
export function parseCatalog(source) {
  const browsers = [];
  const pattern =
    /id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*bundleId:\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    browsers.push({ id: match[1], name: match[2], bundleId: match[3] });
  }
  return browsers;
}

/** Zen's old icon path was a document file Raycast cached. A new path reloads the dock mark. */
export function commandIconPath(id) {
  return id === "zen" ? "browsers/zen-mark.png" : `browsers/${id}.png`;
}

export function commandEntries(browsers, iconsOnDisk) {
  const commands = [
    {
      name: "search",
      title: "Omnibar",
      description:
        "Search tabs, history, bookmarks, commands, the web, sites, and extensions in the frontmost browser.",
      mode: "view",
    },
  ];
  for (const browser of browsers) {
    const entry = {
      name: `cmd-${browser.id}`,
      title: browser.name,
      description: `Omnibar for ${browser.name}, opened with Cmd+P.`,
      mode: "view",
    };
    const icon = commandIconPath(browser.id);
    if (iconsOnDisk.has(icon)) entry.icon = icon;
    commands.push(entry);
  }
  commands.push({
    name: "sync-browser-exclusions",
    title: "Apply Browser Exclusions",
    description:
      "Rewrite the Karabiner Cmd+P allowlist from your excluded-browser preferences.",
    mode: "no-view",
    disabledByDefault: true,
  });
  return commands;
}
