import {
  Action,
  ActionPanel,
  Application,
  Color,
  Icon,
  List,
  closeMainWindow,
  getFrontmostApplication,
  getPreferenceValues,
  popToRoot,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";
import {
  ExtensionPreferences,
  findBrowserByBundleId,
  isBrowserExcluded,
  type BrowserDefinition,
} from "./browsers";
import { Tab, classifyInput } from "./classify";
import { BrowserExtension, getInstalledExtensions } from "./extensions";
import { applyExclusionsToKarabiner } from "./karabiner";
import { openInBrowser, openQueryInBrowser } from "./open";
import {
  SiteEngine,
  fetchDuckDuckGoSuggestions,
  fetchYouTubeSuggestions,
  isYouTubeEngine,
  loadSiteEngines,
  matchingSiteEngines,
  resolveEngineKeyword,
  siteEngineFromTab,
} from "./site-search";
import { getTabsForBrowser, jumpToTab } from "./tabs";

type ScopedSite = SiteEngine | null;

export default function Command() {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const [searchText, setSearchText] = useState("");
  const [scopedSite, setScopedSite] = useState<ScopedSite>(null);

  const {
    data: context,
    isLoading: isLoadingContext,
    error: contextError,
  } = usePromise(async () => {
    const frontmost = await getFrontmostApplication();
    const browser = findBrowserByBundleId(frontmost.bundleId);
    if (!browser || isBrowserExcluded(frontmost.bundleId, prefs)) {
      return {
        frontmost,
        browser: null as BrowserDefinition | null,
        allowed: false,
      };
    }
    return { frontmost, browser, allowed: true };
  });

  useEffect(() => {
    if (!context?.allowed) return;
    try {
      applyExclusionsToKarabiner(prefs);
    } catch {
      // Non-fatal if Karabiner config is missing / locked
    }
  }, [context?.allowed]);

  const siteEngines = useMemo(
    () => loadSiteEngines(context?.browser ?? null),
    [context?.browser],
  );

  const { data: tabs = [], isLoading: isLoadingTabs } = usePromise(
    async (appName: string, bundleId: string) => {
      const app: Application = { name: appName, path: "", bundleId };
      return getTabsForBrowser(app);
    },
    [context?.frontmost?.name ?? "", context?.frontmost?.bundleId ?? ""],
    { execute: Boolean(context?.allowed && context.frontmost?.name) },
  );

  const { data: extensions = [], isLoading: isLoadingExtensions } = usePromise(
    async (bundleId: string) => {
      const browser = findBrowserByBundleId(bundleId);
      if (!browser) return [] as BrowserExtension[];
      return getInstalledExtensions(browser);
    },
    [context?.frontmost?.bundleId ?? ""],
    {
      execute: Boolean(
        context?.allowed &&
        context.browser?.engine !== "webkit" &&
        context.frontmost?.bundleId,
      ),
    },
  );

  const suggestionsEnabled = prefs.enableSuggestions !== false;

  const { data: suggestions = [], isLoading: isLoadingSuggestions } =
    usePromise(
      async (query: string, scopedId: string | null, youtube: boolean) => {
        if (!suggestionsEnabled || !query.trim()) return [] as string[];
        if (youtube) return fetchYouTubeSuggestions(query);
        return fetchDuckDuckGoSuggestions(query);
      },
      [
        scopedSite ? searchText : "",
        scopedSite?.id ?? null,
        scopedSite ? isYouTubeEngine(scopedSite) : false,
      ],
      { execute: Boolean(scopedSite) && suggestionsEnabled },
    );

  const { data: globalSuggestions = [] } = usePromise(
    async (query: string) => {
      if (!suggestionsEnabled || !query.trim() || scopedSite)
        return [] as string[];
      return fetchDuckDuckGoSuggestions(query);
    },
    [searchText],
    {
      execute:
        !scopedSite && suggestionsEnabled && searchText.trim().length > 0,
    },
  );

  const fuseTabs = useMemo(
    () =>
      new Fuse(tabs, {
        keys: ["title", "url", "domain"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [tabs],
  );

  const fuseExtensions = useMemo(
    () =>
      new Fuse(extensions, {
        keys: ["name", "description", "id"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [extensions],
  );

  const filteredTabs = useMemo(() => {
    const q = searchText.trim();
    if (!q) return tabs;
    return fuseTabs.search(q).map((r) => r.item);
  }, [fuseTabs, searchText, tabs]);

  const filteredExtensions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return [];
    if (q === "ext" || q.startsWith("ext ") || q.includes("extension")) {
      const rest = q.replace(/^ext(ension)?s?\s*/i, "").trim();
      if (!rest) return extensions.slice(0, 20);
      return fuseExtensions
        .search(rest)
        .map((r) => r.item)
        .slice(0, 20);
    }
    return fuseExtensions
      .search(q)
      .map((r) => r.item)
      .slice(0, 8);
  }, [extensions, fuseExtensions, searchText]);

  const keywordEngine = useMemo(() => {
    if (scopedSite || !searchText.trim()) return null;
    return resolveEngineKeyword(searchText, siteEngines);
  }, [scopedSite, searchText, siteEngines]);

  const siteMatches = useMemo(() => {
    if (scopedSite || !searchText.trim()) return [] as SiteEngine[];
    return matchingSiteEngines(searchText, siteEngines, tabs);
  }, [scopedSite, searchText, siteEngines, tabs]);

  const isLoading =
    isLoadingContext ||
    isLoadingTabs ||
    isLoadingExtensions ||
    isLoadingSuggestions;

  if (contextError) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Could not detect frontmost app"
          description={String(contextError)}
        />
      </List>
    );
  }

  if (context && !context.allowed) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Globe}
          title="No supported browser frontmost"
          description={
            context.frontmost
              ? `${context.frontmost.name} is not an allowed browser (unsupported or excluded).`
              : "Focus a Chromium/WebKit browser, then press Cmd+P."
          }
        />
      </List>
    );
  }

  const app = context?.frontmost;
  const browser = context?.browser;

  async function runAndClose(action: () => Promise<void>) {
    await action();
    await closeMainWindow();
    await popToRoot();
  }

  function enterSiteSearch(site: SiteEngine) {
    setScopedSite(site);
    setSearchText("");
  }

  const placeholder = scopedSite
    ? `Search ${scopedSite.name}…`
    : keywordEngine
      ? `${keywordEngine.name} — press Tab to search`
      : browser
        ? `Search ${browser.name} tabs, web, sites…`
        : "Search…";

  const classified = classifyInput(searchText);
  const primaryTitle = !searchText.trim()
    ? null
    : classified.kind === "url"
      ? `Open ${classified.value}`
      : scopedSite
        ? `Search ${scopedSite.name} for “${searchText.trim()}”`
        : `Search “${searchText.trim()}”`;

  // When the typed token is a browser search-engine keyword, focus that row so
  // Tab enters scoped search (Chrome/Arc omnibox). Otherwise prefer first tab.
  const preferredItemId = scopedSite
    ? undefined
    : keywordEngine
      ? `site-${keywordEngine.id}`
      : filteredTabs[0]
        ? `tab-${filteredTabs[0].windowId}-${filteredTabs[0].tabId}-${filteredTabs[0].url}`
        : undefined;

  function handleSearchTextChange(next: string) {
    if (scopedSite && searchText.length > 0 && next.length === 0) {
      setSearchText("");
      return;
    }
    if (scopedSite && searchText.length === 0 && next.length === 0) {
      return;
    }
    setSearchText(next);
  }

  const engineBadgeColor = scopedSite
    ? Color.Red
    : keywordEngine
      ? Color.Orange
      : Color.SecondaryText;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={placeholder}
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      filtering={false}
      throttle
      selectedItemId={preferredItemId}
    >
      {scopedSite ? (
        <>
          {primaryTitle && app && (
            <List.Section title={scopedSite.name}>
              <List.Item
                title={primaryTitle}
                icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Red }}
                accessories={[
                  {
                    tag: {
                      value: scopedSite.name,
                      color: Color.Red,
                    },
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title={`Search ${scopedSite.name}`}
                      icon={Icon.MagnifyingGlass}
                      onAction={() =>
                        runAndClose(async () => {
                          await openInBrowser(
                            app,
                            scopedSite.buildUrl(searchText.trim()),
                          );
                        })
                      }
                    />
                    <Action
                      title="Exit Site Search"
                      icon={Icon.Undo}
                      shortcut={{ modifiers: [], key: "backspace" }}
                      onAction={() => {
                        setScopedSite(null);
                        setSearchText("");
                      }}
                    />
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {(suggestions.length > 0 || globalSuggestions.length > 0) && (
            <List.Section title="Suggestions">
              {(suggestions.length ? suggestions : globalSuggestions).map(
                (suggestion) => (
                  <List.Item
                    key={`sug-${suggestion}`}
                    title={suggestion}
                    icon={{
                      source: Icon.MagnifyingGlass,
                      tintColor: Color.Red,
                    }}
                    accessories={[
                      {
                        tag: {
                          value: scopedSite.name,
                          color: Color.Red,
                        },
                      },
                    ]}
                    actions={
                      <ActionPanel>
                        <Action
                          title={`Search ${scopedSite.name}`}
                          icon={Icon.MagnifyingGlass}
                          onAction={() =>
                            runAndClose(async () => {
                              if (!app) return;
                              await openInBrowser(
                                app,
                                scopedSite.buildUrl(suggestion),
                              );
                            })
                          }
                        />
                        <Action
                          title="Exit Site Search"
                          icon={Icon.Undo}
                          onAction={() => setScopedSite(null)}
                        />
                      </ActionPanel>
                    }
                  />
                ),
              )}
            </List.Section>
          )}
          {!searchText.trim() && (
            <List.Section title={scopedSite.name}>
              <List.Item
                title={`Search ${scopedSite.name}…`}
                subtitle="Type a query, or press ⌫ to exit"
                icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Red }}
                accessories={[
                  {
                    tag: {
                      value: scopedSite.name,
                      color: Color.Red,
                    },
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Exit Site Search"
                      icon={Icon.Undo}
                      shortcut={{ modifiers: [], key: "backspace" }}
                      onAction={() => {
                        setScopedSite(null);
                        setSearchText("");
                      }}
                    />
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
        </>
      ) : (
        <>
          {/* Keyword match first — Tab scopes like Chrome/Arc omnibox */}
          {siteMatches.length > 0 && (
            <List.Section
              title="Search Site"
              subtitle={
                keywordEngine
                  ? `Tab → ${keywordEngine.name}`
                  : `${siteMatches.length}`
              }
            >
              {siteMatches.map((site) => (
                <List.Item
                  key={site.id}
                  id={`site-${site.id}`}
                  title={`Search ${site.name}`}
                  subtitle={
                    keywordEngine?.id === site.id
                      ? "Press Tab to scope search"
                      : searchText.trim()
                        ? `for “${searchText.trim()}”`
                        : undefined
                  }
                  icon={{
                    source: Icon.MagnifyingGlass,
                    tintColor:
                      keywordEngine?.id === site.id
                        ? engineBadgeColor
                        : undefined,
                  }}
                  accessories={[
                    {
                      tag: {
                        value: site.keywords[0] ?? site.name,
                        color:
                          keywordEngine?.id === site.id
                            ? Color.Red
                            : Color.SecondaryText,
                      },
                    },
                    { text: "Tab", icon: Icon.ArrowRight },
                  ]}
                  actions={
                    <ActionPanel>
                      <Action
                        title={`Enter ${site.name} Search`}
                        icon={Icon.ArrowRight}
                        shortcut={{ modifiers: [], key: "tab" }}
                        onAction={() => enterSiteSearch(site)}
                      />
                      <Action
                        title={
                          searchText.trim() && keywordEngine?.id !== site.id
                            ? `Search ${site.name}`
                            : `Search ${site.name}…`
                        }
                        icon={Icon.MagnifyingGlass}
                        onAction={() => {
                          if (
                            searchText.trim() &&
                            keywordEngine?.id !== site.id &&
                            app
                          ) {
                            runAndClose(async () => {
                              await openInBrowser(
                                app,
                                site.buildUrl(searchText.trim()),
                              );
                            });
                          } else {
                            enterSiteSearch(site);
                          }
                        }}
                      />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          )}

          {filteredTabs.length > 0 && (
            <List.Section
              title={searchText.trim() ? "Tabs" : "Open Tabs"}
              subtitle={`${filteredTabs.length}`}
            >
              {filteredTabs.map((tab) => (
                <TabItem
                  key={`${tab.windowId}-${tab.tabId}-${tab.url}`}
                  tab={tab}
                  app={app!}
                  browser={browser!}
                  engines={siteEngines}
                  keywordEngine={keywordEngine}
                  onJump={() =>
                    runAndClose(async () => {
                      await jumpToTab(app!, browser!, tab);
                    })
                  }
                  onScope={(site) => enterSiteSearch(site)}
                />
              ))}
            </List.Section>
          )}

          {primaryTitle && app && browser && (
            <List.Section title="Web">
              <List.Item
                title={primaryTitle}
                icon={Icon.MagnifyingGlass}
                accessories={[{ text: browser.name }]}
                actions={
                  <ActionPanel>
                    <Action
                      title={
                        classified.kind === "url" ? "Open URL" : "Search Web"
                      }
                      icon={Icon.Globe}
                      onAction={() =>
                        runAndClose(async () => {
                          await openQueryInBrowser(app, searchText);
                        })
                      }
                    />
                  </ActionPanel>
                }
              />
              {globalSuggestions.slice(0, 5).map((suggestion) => (
                <List.Item
                  key={`gsug-${suggestion}`}
                  title={`Search “${suggestion}”`}
                  icon={Icon.Text}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Search Web"
                        icon={Icon.Globe}
                        onAction={() =>
                          runAndClose(async () => {
                            await openQueryInBrowser(app, suggestion);
                          })
                        }
                      />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          )}

          {filteredExtensions.length > 0 && (
            <List.Section title="Extensions">
              {filteredExtensions.map((ext) => (
                <List.Item
                  key={ext.id}
                  title={ext.name}
                  subtitle={ext.description}
                  icon={Icon.Plug}
                  accessories={[{ text: "Extension" }]}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Open Extension"
                        icon={Icon.Plug}
                        onAction={() =>
                          runAndClose(async () => {
                            if (!app) return;
                            await openInBrowser(app, ext.detailsUrl);
                          })
                        }
                      />
                      {ext.optionsUrl && (
                        <Action
                          title="Open Options"
                          icon={Icon.Gear}
                          onAction={() =>
                            runAndClose(async () => {
                              if (!app) return;
                              await openInBrowser(app, ext.optionsUrl!);
                            })
                          }
                        />
                      )}
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          )}

          {!isLoading && tabs.length === 0 && !searchText.trim() && (
            <List.EmptyView
              icon={Icon.Window}
              title="No open tabs"
              description="Grant Raycast Automation access to this browser, or open a tab and try again."
            />
          )}
        </>
      )}
    </List>
  );
}

function TabItem(props: {
  tab: Tab;
  app: Application;
  browser: BrowserDefinition;
  engines: SiteEngine[];
  keywordEngine: SiteEngine | null;
  onJump: () => void;
  onScope: (site: SiteEngine) => void;
}) {
  const { tab, engines, keywordEngine, onJump, onScope } = props;
  const tabSite = siteEngineFromTab(tab, engines);

  return (
    <List.Item
      id={`tab-${tab.windowId}-${tab.tabId}-${tab.url}`}
      title={tab.title}
      subtitle={tab.domain}
      icon={Icon.Link}
      accessories={[
        { tag: { value: "Switch to Tab", color: Color.SecondaryText } },
        { icon: Icon.ArrowRight },
      ]}
      actions={
        <ActionPanel>
          <Action
            title="Switch to Tab"
            icon={Icon.ArrowRight}
            onAction={onJump}
          />
          <Action
            title={`Search ${keywordEngine?.name ?? tabSite.name}`}
            icon={Icon.MagnifyingGlass}
            shortcut={{ modifiers: [], key: "tab" }}
            onAction={() => onScope(keywordEngine ?? tabSite)}
          />
          <Action.CopyToClipboard title="Copy URL" content={tab.url} />
        </ActionPanel>
      }
    />
  );
}
