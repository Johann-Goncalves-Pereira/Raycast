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
  matchingSiteEngines,
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
    // Keep Karabiner allowlist roughly in sync when Spotlight opens successfully
    if (!context?.allowed) return;
    try {
      applyExclusionsToKarabiner(prefs);
    } catch {
      // Non-fatal if Karabiner config is missing / locked
    }
  }, [context?.allowed]);

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
      async (query: string, scopedId: string | null) => {
        if (!suggestionsEnabled || !query.trim()) return [] as string[];
        if (scopedId === "youtube") return fetchYouTubeSuggestions(query);
        if (scopedSite) return fetchDuckDuckGoSuggestions(query);
        return fetchDuckDuckGoSuggestions(query);
      },
      [scopedSite ? searchText : "", scopedSite?.id ?? null],
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

  const siteMatches = useMemo(() => {
    if (scopedSite || !searchText.trim()) return [] as SiteEngine[];
    return matchingSiteEngines(searchText, tabs);
  }, [scopedSite, searchText, tabs]);

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

  const placeholder = scopedSite
    ? `Search ${scopedSite.name}…`
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

  function handleSearchTextChange(next: string) {
    if (scopedSite && searchText.length > 0 && next.length === 0) {
      // Clear query inside scoped mode first
      setSearchText("");
      return;
    }
    if (scopedSite && searchText.length === 0 && next.length === 0) {
      return;
    }
    setSearchText(next);
  }

  // Backspace on empty scoped query: leave scoped mode via Action or detecting delete
  useEffect(() => {
    // no-op placeholder — handled via Action "Exit Site Search"
  }, []);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={placeholder}
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      filtering={false}
      throttle
    >
      {scopedSite ? (
        <>
          {primaryTitle && app && (
            <List.Section title={scopedSite.name}>
              <List.Item
                title={primaryTitle}
                icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Red }}
                accessories={[{ text: scopedSite.name }]}
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
                    icon={Icon.Text}
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
                onJump={() =>
                  runAndClose(async () => {
                    await jumpToTab(app!, browser!, tab);
                  })
                }
                onScope={() => {
                  setScopedSite(siteEngineFromTab(tab));
                  setSearchText("");
                }}
              />
            ))}
          </List.Section>

          {siteMatches.length > 0 && (
            <List.Section title="Search Site">
              {siteMatches.map((site) => (
                <List.Item
                  key={site.id}
                  title={`Search ${site.name}`}
                  subtitle={
                    searchText.trim() ? `for “${searchText.trim()}”` : undefined
                  }
                  icon={Icon.Link}
                  accessories={[{ text: "Tab →", icon: Icon.ArrowRight }]}
                  actions={
                    <ActionPanel>
                      <Action
                        title={
                          searchText.trim()
                            ? `Search ${site.name}`
                            : `Search ${site.name}…`
                        }
                        icon={Icon.MagnifyingGlass}
                        onAction={() => {
                          if (searchText.trim() && app) {
                            runAndClose(async () => {
                              await openInBrowser(
                                app,
                                site.buildUrl(searchText.trim()),
                              );
                            });
                          } else {
                            setScopedSite(site);
                            setSearchText("");
                          }
                        }}
                      />
                      <Action
                        title={`Enter ${site.name} Search`}
                        icon={Icon.ArrowRight}
                        shortcut={{ modifiers: [], key: "tab" }}
                        onAction={() => {
                          setScopedSite(site);
                          setSearchText("");
                        }}
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
  onJump: () => void;
  onScope: () => void;
}) {
  const { tab, onJump, onScope } = props;
  return (
    <List.Item
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
            title={`Search ${siteEngineFromTab(tab).name}`}
            icon={Icon.MagnifyingGlass}
            shortcut={{ modifiers: [], key: "tab" }}
            onAction={onScope}
          />
          <Action.CopyToClipboard title="Copy URL" content={tab.url} />
        </ActionPanel>
      }
    />
  );
}
