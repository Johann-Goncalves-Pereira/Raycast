import {
  Action,
  ActionPanel,
  Application,
  Clipboard,
  Color,
  Icon,
  List,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  popToRoot,
  showToast,
} from "@raycast/api";
import { runAppleScript, useCachedPromise, usePromise } from "@raycast/utils";
import Fuse from "fuse.js";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createBrowserActions, type ActionEngine } from "./browser-actions";
import {
  BookmarkItem,
  getBrowserBookmarks,
  peekCachedBookmarks,
} from "./browser-bookmarks";
import { getBrowserSearchEngines, peekCachedEngines } from "./browser-engines";
import {
  HistoryItem,
  filterHistory,
  getBrowserHistory,
  peekCachedHistory,
} from "./browser-history";
import {
  ExtensionPreferences,
  findBrowserByBundleId,
  type BrowserDefinition,
} from "./browsers";
import { resolveOmnibarContext } from "./resolve-frontmost-browser";
import { Tab, classifyInput } from "./classify";
import { BrowserCommand, filterCommands } from "./commands";
import {
  BrowserExtension,
  getInstalledExtensions,
  peekCachedExtensions,
} from "./extensions";
import { askBridge } from "./ask-bridge";
import {
  FALLBACK_BANGS,
  bangItemId,
  buildBangSearchUrl,
  bumpBangUsage,
  historyItemId,
  mergeBangCatalog,
  parseBangQuery,
  rankBangs,
  readBangUsage,
  resolveBangPrefix,
  type Bang,
} from "./bangs";
import { evaluateInlineAnswer } from "./inline-answers";
import { openInBrowser, openQueryInBrowser } from "./open";
import {
  MRU_TAB_LIMIT,
  NEW_SEARCH_ITEM_ID,
  SCOPED_SEARCH_ITEM_ID,
  commandItemId,
  mruTabs,
  parseQueryScope,
  sectionsForQuery,
  selectionAfterType,
  tabItemId,
  tabJumpTarget,
  type ResultSection,
} from "./result-order";
import { loadSession, saveSession } from "./session";
import {
  FALLBACK_SITE_ENGINES,
  SiteEngine,
  fetchDuckDuckGoSuggestions,
  fetchYouTubeSuggestions,
  isYouTubeEngine,
  matchingSiteEngines,
  resolveEngineKeyword,
  siteEngineFromTab,
  siteEnginesFromKeywords,
} from "./site-search";
import { formatMarkdownLink, sanitizeUrl } from "./supercopy";
import {
  getActiveTabForBrowser,
  getTabsForBrowser,
  jumpToTab,
  peekCachedTabs,
} from "./tabs";
import { writeLastBrowserHint } from "./last-browser";

type ScopedSite = SiteEngine | null;

const SUGGESTION_DEBOUNCE_MS = 200;
const FILTER_DEBOUNCE_MS = 80;
const HISTORY_EMPTY_LIMIT = 8;
const HISTORY_QUERY_LIMIT = 12;
const BOOKMARK_LIMIT = 12;
const COMMAND_LIMIT = 10;
const TAB_QUERY_LIMIT = 20;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function Command() {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const [searchText, setSearchText] = useState("");
  const [scopedSite, setScopedSite] = useState<ScopedSite>(null);
  const [scopedBang, setScopedBang] = useState<Bang | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const suggestionAbort = useRef<AbortController | null>(null);
  const selectionPin = useRef<{ id: string | undefined } | null>(null);
  const sessionRestored = useRef(false);

  const {
    data: context,
    isLoading: isLoadingContext,
    error: contextError,
  } = usePromise(async () => resolveOmnibarContext(prefs));

  useEffect(() => {
    if (!context) return;
    if (!context.allowed) {
      void (async () => {
        await closeMainWindow({ clearRootSearch: true });
        await popToRoot({ clearSearchBar: true });
      })();
      return;
    }
    writeLastBrowserHint({
      bundleId: context.browser.bundleId,
      name: context.browser.name,
      recordedAt: Date.now(),
    });
    if (sessionRestored.current) return;
    sessionRestored.current = true;
    const prior = loadSession(context.browser.bundleId);
    if (!prior) return;
    setSearchText(prior.searchText);
    if (prior.scopedKind === "site" && prior.scopedId) {
      const engines =
        siteEnginesFromKeywords(
          peekCachedEngines(context.browser.bundleId) ?? [],
        ) || FALLBACK_SITE_ENGINES;
      const site =
        engines.find((e) => e.id === prior.scopedId) ??
        FALLBACK_SITE_ENGINES.find((e) => e.id === prior.scopedId);
      if (site) setScopedSite(site);
    }
    if (prior.scopedKind === "bang" && prior.scopedId) {
      const bang = FALLBACK_BANGS.find((b) => b.id === prior.scopedId);
      if (bang) setScopedBang(bang);
    }
  }, [context]);

  useEffect(() => {
    if (!context?.allowed || !context.browser) return;
    saveSession(context.browser.bundleId, {
      searchText,
      scopedId: scopedBang?.id ?? scopedSite?.id ?? null,
      scopedKind: scopedBang ? "bang" : scopedSite ? "site" : null,
    });
  }, [context, searchText, scopedBang, scopedSite]);

  // Normalize `@youtube query` / `@Ask …` into bang scope + remainder.
  useEffect(() => {
    if (scopedBang || scopedSite) return;
    const parsed = parseBangQuery(searchText);
    if (!parsed.bangToken || parsed.listingAll) return;
    if (!parsed.rest && !searchText.includes(" ")) return;
    const bang = resolveBangPrefix(
      parsed.bangToken,
      mergeBangCatalog(FALLBACK_SITE_ENGINES),
      readBangUsage(),
    );
    if (!bang) return;
    if (parsed.bangToken.toLowerCase() === bang.id.toLowerCase() ||
        `@${parsed.bangToken}`.toLowerCase() === bang.trigger.toLowerCase()) {
      enterBangScope(bang);
      setSearchText(parsed.rest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, scopedBang, scopedSite]);

  const bundleId = context?.frontmost?.bundleId ?? "";
  const cachedTabs = bundleId ? peekCachedTabs(bundleId) ?? [] : [];
  const cachedHistory = bundleId ? peekCachedHistory(bundleId) ?? [] : [];
  const cachedBookmarks = bundleId ? peekCachedBookmarks(bundleId) ?? [] : [];
  const cachedExtensions = bundleId ? peekCachedExtensions(bundleId) ?? [] : [];
  const cachedEngines = bundleId ? peekCachedEngines(bundleId) ?? [] : [];

  const { data: keywordEngines = cachedEngines } = useCachedPromise(
    async (id: string) => {
      const browser = findBrowserByBundleId(id);
      if (!browser || browser.engine === "webkit") return [];
      return getBrowserSearchEngines(browser);
    },
    [bundleId],
    {
      execute: Boolean(context?.allowed && bundleId),
      initialData: cachedEngines,
    },
  );

  const siteEngines = useMemo(() => {
    if (keywordEngines.length === 0) return FALLBACK_SITE_ENGINES;
    return siteEnginesFromKeywords(keywordEngines);
  }, [keywordEngines]);

  const bangCatalog = useMemo(
    () => mergeBangCatalog(siteEngines),
    [siteEngines],
  );
  const bangUsage = useMemo(() => readBangUsage(), [searchText, scopedBang]);
  const rankedBangs = useMemo(
    () => rankBangs(bangCatalog, bangUsage),
    [bangCatalog, bangUsage],
  );

  const { data: tabs = cachedTabs, isLoading: isLoadingTabs } =
    useCachedPromise(
      async (appName: string, id: string) => {
        const app: Application = { name: appName, path: "", bundleId: id };
        return getTabsForBrowser(app);
      },
      [context?.frontmost?.name ?? "", bundleId],
      {
        execute: Boolean(context?.allowed && context.frontmost?.name),
        initialData: cachedTabs,
      },
    );

  const {
    data: extensions = cachedExtensions,
    isLoading: isLoadingExtensions,
  } = useCachedPromise(
    async (id: string) => {
      const browser = findBrowserByBundleId(id);
      if (!browser) return [] as BrowserExtension[];
      return getInstalledExtensions(browser);
    },
    [bundleId],
    {
      execute: Boolean(
        context?.allowed && context.browser?.engine !== "webkit" && bundleId,
      ),
      initialData: cachedExtensions,
    },
  );

  const { data: history = cachedHistory, isLoading: isLoadingHistory } =
    useCachedPromise(
      async (id: string) => {
        const browser = findBrowserByBundleId(id);
        if (!browser) return [] as HistoryItem[];
        return getBrowserHistory(browser);
      },
      [bundleId],
      {
        execute: Boolean(context?.allowed && bundleId),
        initialData: cachedHistory,
        keepPreviousData: true,
      },
    );

  const { data: bookmarks = cachedBookmarks, isLoading: isLoadingBookmarks } =
    useCachedPromise(
      async (id: string) => {
        const browser = findBrowserByBundleId(id);
        if (!browser) return [] as BookmarkItem[];
        return getBrowserBookmarks(browser);
      },
      [bundleId],
      {
        execute: Boolean(
          context?.allowed && context.browser?.engine !== "webkit" && bundleId,
        ),
        initialData: cachedBookmarks,
      },
    );

  const suggestionsEnabled = prefs.enableSuggestions !== false;
  const debouncedFilterText = useDebouncedValue(searchText, FILTER_DEBOUNCE_MS);
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SUGGESTION_DEBOUNCE_MS,
  );

  const queryScope = parseQueryScope(searchText);
  const filterScope = parseQueryScope(debouncedFilterText);
  const actionScoped = queryScope.mode === "commands";
  const bangListing = queryScope.mode === "bangs";
  const bangParse = parseBangQuery(searchText);
  const activeBang =
    scopedBang ??
    (bangParse.bangToken
      ? resolveBangPrefix(bangParse.bangToken, bangCatalog, bangUsage)
      : undefined);
  const filterQuery =
    scopedBang || (bangParse.bangToken && activeBang)
      ? bangParse.rest
      : filterScope.filterQuery;
  const domainScope =
    scopedBang?.domains ??
    scopedSite?.domains ??
    (activeBang && !bangParse.listingAll ? activeBang.domains : undefined);

  const suggestionQuery =
    suggestionsEnabled && !actionScoped && !scopedSite
      ? debouncedSearchText.trim()
      : suggestionsEnabled && scopedSite
        ? debouncedSearchText.trim()
        : "";
  const suggestionYoutube = Boolean(
    (scopedSite && isYouTubeEngine(scopedSite)) ||
      scopedBang?.id === "youtube" ||
      scopedBang?.domains.some((d) => d.includes("youtube")),
  );

  const { data: suggestions = [] } = useCachedPromise(
    async (query: string, youtube: boolean) => {
      if (!query) return [] as string[];
      if (youtube) {
        return fetchYouTubeSuggestions(query, suggestionAbort.current?.signal);
      }
      return fetchDuckDuckGoSuggestions(query, suggestionAbort.current?.signal);
    },
    [suggestionQuery, suggestionYoutube],
    {
      execute:
        suggestionsEnabled && suggestionQuery.length > 0 && !actionScoped,
      keepPreviousData: true,
      abortable: suggestionAbort,
      initialData: [] as string[],
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

  const fuseHistory = useMemo(
    () =>
      new Fuse(history, {
        keys: ["title", "url", "domain"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [history],
  );

  const fuseBookmarks = useMemo(
    () =>
      new Fuse(bookmarks, {
        keys: ["title", "url", "domain", "folderPath"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [bookmarks],
  );

  const filteredTabs = useMemo(() => {
    if (actionScoped) return [] as Tab[];
    const q = filterQuery;
    if (!q) return mruTabs(tabs, MRU_TAB_LIMIT);
    return fuseTabs
      .search(q)
      .map((r) => r.item)
      .slice(0, TAB_QUERY_LIMIT);
  }, [actionScoped, filterQuery, fuseTabs, tabs]);

  const filteredHistory = useMemo(() => {
    if (actionScoped || bangListing) return [] as HistoryItem[];
    const domainFiltered =
      domainScope && domainScope.length > 0
        ? filterHistory(history, "", domainScope, 200)
        : history;
    const q = filterQuery;
    if (!q) return domainFiltered.slice(0, HISTORY_EMPTY_LIMIT);
    const fuse = new Fuse(domainFiltered, {
      keys: ["title", "url", "domain"],
      threshold: 0.4,
      ignoreLocation: true,
    });
    return fuse
      .search(q)
      .map((r) => r.item)
      .slice(0, HISTORY_QUERY_LIMIT);
  }, [
    actionScoped,
    bangListing,
    domainScope,
    filterQuery,
    history,
  ]);

  const filteredBookmarks = useMemo(() => {
    if (actionScoped || bangListing) return [] as BookmarkItem[];
    const q = filterQuery;
    if (!q) return bookmarks.slice(0, BOOKMARK_LIMIT);
    return fuseBookmarks
      .search(q)
      .map((r) => r.item)
      .slice(0, BOOKMARK_LIMIT);
  }, [actionScoped, bangListing, filterQuery, fuseBookmarks, bookmarks]);

  const scopedHistory = useMemo(() => {
    const domains = scopedBang?.domains ?? scopedSite?.domains;
    if (!domains || domains.length === 0) return [] as HistoryItem[];
    const domainFiltered = filterHistory(history, "", domains, 200);
    const q = filterQuery;
    if (!q) return domainFiltered.slice(0, HISTORY_EMPTY_LIMIT);
    const fuse = new Fuse(domainFiltered, {
      keys: ["title", "url", "domain"],
      threshold: 0.4,
      ignoreLocation: true,
    });
    return fuse
      .search(q)
      .map((r) => r.item)
      .slice(0, HISTORY_QUERY_LIMIT);
  }, [history, scopedBang, scopedSite, filterQuery]);

  const filteredBangs = useMemo(() => {
    if (!bangListing && !bangParse.bangToken) return [] as Bang[];
    if (bangListing || bangParse.bangToken === "") return rankedBangs;
    const token = (bangParse.bangToken ?? "").toLowerCase();
    return rankedBangs.filter((bang) => {
      const aliases = [
        bang.id,
        bang.name,
        bang.trigger.replace(/^@/, ""),
        ...bang.domains,
      ].map((s) => s.toLowerCase());
      return aliases.some((a) => a.startsWith(token) || a.includes(token));
    });
  }, [bangListing, bangParse.bangToken, rankedBangs]);

  const filteredExtensions = useMemo(() => {
    if (actionScoped) return [] as BrowserExtension[];
    const q = filterQuery.toLowerCase();
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
  }, [actionScoped, extensions, fuseExtensions, filterQuery]);

  const filteredCommands = useMemo(() => {
    const q =
      filterScope.mode === "commands"
        ? filterScope.filterQuery
        : actionScoped
          ? ""
          : filterQuery;
    // Empty unified query → suggested; `/ ` with no filter → suggested; else match
    if (filterScope.mode === "commands") {
      return filterCommands(q, COMMAND_LIMIT);
    }
    if (!filterQuery) return filterCommands("", COMMAND_LIMIT);
    return filterCommands(filterQuery, COMMAND_LIMIT);
  }, [actionScoped, filterQuery, filterScope]);

  const keywordEngine = useMemo(() => {
    if (scopedSite || actionScoped || !filterQuery) return null;
    return resolveEngineKeyword(searchText, siteEngines);
  }, [scopedSite, actionScoped, filterQuery, searchText, siteEngines]);

  const siteMatches = useMemo(() => {
    if (scopedSite || actionScoped || !filterQuery) return [] as SiteEngine[];
    return matchingSiteEngines(searchText, siteEngines, tabs);
  }, [scopedSite, actionScoped, filterQuery, searchText, siteEngines, tabs]);

  const inlineAnswer = useMemo(() => {
    if (scopedSite || actionScoped) return undefined;
    return evaluateInlineAnswer(searchText);
  }, [scopedSite, actionScoped, searchText]);

  const hasCachedData =
    tabs.length > 0 ||
    history.length > 0 ||
    bookmarks.length > 0 ||
    cachedTabs.length > 0 ||
    cachedHistory.length > 0;
  const isLoading =
    isLoadingContext ||
    (!hasCachedData &&
      (isLoadingTabs ||
        isLoadingExtensions ||
        isLoadingHistory ||
        isLoadingBookmarks));

  const prefixBang = resolveBangPrefix(
    searchText.trim().replace(/^@/, ""),
    bangCatalog,
    bangUsage,
  );

  const jumpTargetId =
    scopedSite || scopedBang || actionScoped
      ? undefined
      : tabJumpTarget({
          query: searchText,
          bangIds: prefixBang ? [prefixBang.id] : filteredBangs.map((b) => b.id),
          siteIds: siteMatches.map((site) => site.id),
          tabs: filteredTabs.map((tab) => ({
            windowId: tab.windowId,
            tabId: tab.tabId,
            url: tab.url,
          })),
          extensionIds: filteredExtensions.map((ext) => ext.id),
          commandIds: filteredCommands.map((cmd) => cmd.id),
        });

  useEffect(() => {
    const id = selectionAfterType({
      query: searchText,
      scoped: Boolean(scopedSite || scopedBang),
      matchingTabs: filteredTabs.map((tab) => ({
        windowId: tab.windowId,
        tabId: tab.tabId,
        url: tab.url,
      })),
      historyUrls: filteredHistory.map((item) => item.url),
      commandIds: filteredCommands.map((cmd) => cmd.id),
      bangIds: filteredBangs.map((b) => b.id),
      answerId: inlineAnswer?.id,
    });
    setSelectedItemId((current) => {
      if (current === id) {
        selectionPin.current = null;
        return current;
      }
      selectionPin.current = { id };
      return id;
    });
  }, [
    searchText,
    scopedSite,
    scopedBang,
    filteredTabs,
    filteredHistory,
    filteredCommands,
    filteredBangs,
    inlineAnswer,
  ]);

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
    return <List isLoading />;
  }

  const app = context?.frontmost;
  const browser = context?.browser;

  async function closeOmnibarFully() {
    await popToRoot({ clearSearchBar: true });
    await closeMainWindow({ clearRootSearch: true });
  }

  async function runAndClose(action: () => Promise<void>) {
    await action();
    await closeOmnibarFully();
  }

  function enterSiteSearch(site: SiteEngine) {
    setScopedBang(null);
    setScopedSite(site);
    setSearchText("");
  }

  function enterBangScope(bang: Bang) {
    bumpBangUsage(bang.id);
    setScopedSite(null);
    setScopedBang(bang);
    setAskAnswer(null);
    setSearchText("");
  }

  async function runAsk(prompt: string) {
    setAskLoading(true);
    setAskAnswer(null);
    try {
      const result = await askBridge(prompt);
      if (!result.ok) {
        await showToast({
          style: Toast.Style.Failure,
          title: "@Ask",
          message: result.error ?? "Ask Bridge failed",
        });
        return;
      }
      setAskAnswer(result.answer ?? "");
    } finally {
      setAskLoading(false);
    }
  }

  const runBrowserCommand = createBrowserActions({
    runAppleScript: (script) => runAppleScript(script),
    keystroke: async (script) => {
      await runAppleScript(script);
    },
    copyText: async (text) => {
      await Clipboard.copy(text);
    },
    openUrl: async (url) => {
      if (!app) return;
      await openInBrowser(app, url);
    },
    getActiveTab: async () => {
      if (!app || !browser) return undefined;
      return getActiveTabForBrowser(app, browser);
    },
    getOpenTabs: async () => tabs,
  });

  async function executeCommand(command: BrowserCommand) {
    if (!app || !browser) return;
    await runAndClose(async () => {
      const result = await runBrowserCommand(command.id, {
        browserName: app.name,
        engine: browser.engine as ActionEngine,
      });
      if (!result.ok) {
        await showToast({
          style: Toast.Style.Failure,
          title: command.title,
          message: result.message,
        });
        return;
      }
      if (result.message) {
        await showToast({
          style: Toast.Style.Success,
          title: result.message,
        });
      }
    });
  }

  const placeholder = scopedBang
    ? scopedBang.kind === "ask"
      ? "Ask…"
      : `Search ${scopedBang.trigger}…`
    : scopedSite
      ? `Search ${scopedSite.name}…`
      : bangListing
        ? "Choose a bang…"
        : actionScoped
          ? "Filter actions…"
          : keywordEngine
            ? `${keywordEngine.name} — press Tab to jump to action`
            : browser
              ? `Search ${browser.name} — @ bangs · / commands`
              : "Search…";

  const classified = classifyInput(
    actionScoped || bangListing ? "" : filterQuery || searchText,
  );
  const showSearchRow =
    !actionScoped &&
    !bangListing &&
    Boolean((filterQuery || searchText).trim()) &&
    !inlineAnswer &&
    scopedBang?.kind !== "ask";
  const primaryTitle = !showSearchRow
    ? null
    : classified.kind === "url"
      ? `Open ${classified.value}`
      : scopedBang
        ? `Search ${scopedBang.name} for “${(filterQuery || searchText).trim()}”`
        : scopedSite
          ? `Search ${scopedSite.name} for “${searchText.trim()}”`
          : `Search “${searchText.trim()}”`;

  function jumpToAction() {
    if (!jumpTargetId) return;
    const id = jumpTargetId;
    setSelectedItemId((current) => {
      if (current === id) {
        selectionPin.current = null;
        return current;
      }
      selectionPin.current = { id };
      return id;
    });
  }

  function handleSearchTextChange(next: string) {
    if (
      (scopedSite || scopedBang) &&
      searchText.length > 0 &&
      next.length === 0
    ) {
      setSearchText("");
      return;
    }
    if (
      (scopedSite || scopedBang) &&
      searchText.length === 0 &&
      next.length === 0
    ) {
      setScopedSite(null);
      setScopedBang(null);
      setAskAnswer(null);
      return;
    }
    setSearchText(next);
  }

  function jumpToActionOrBang() {
    if (prefixBang && !scopedBang && !searchText.includes(" ")) {
      enterBangScope(prefixBang);
      return;
    }
    jumpToAction();
  }

  const engineBadgeColor = scopedBang || scopedSite
    ? Color.Red
    : keywordEngine
      ? Color.Orange
      : Color.SecondaryText;

  const scopedSuggestions =
    (scopedSite || (scopedBang && scopedBang.kind === "site")) &&
    suggestionQuery.length > 0
      ? suggestions
      : [];
  const globalSuggestions =
    !scopedSite &&
    !scopedBang &&
    !actionScoped &&
    !bangListing &&
    suggestionQuery.length > 0
      ? suggestions
      : [];

  function closeAction() {
    return (
      <Action
        title="Close Omnibar"
        icon={Icon.XmarkCircle}
        shortcut={{ modifiers: [], key: "escape" }}
        onAction={() => {
          void closeOmnibarFully();
        }}
      />
    );
  }

  function renderUnscopedSection(section: ResultSection) {
    if (section === "bangs") {
      if (filteredBangs.length === 0) return null;
      return (
        <List.Section key="bangs" title="Bangs" subtitle={`${filteredBangs.length}`}>
          {filteredBangs.map((bang) => (
            <List.Item
              key={bang.id}
              id={bangItemId(bang.id)}
              title={bang.trigger}
              subtitle={bang.name}
              icon={bang.kind === "ask" ? Icon.SpeechBubble : Icon.Hashtag}
              accessories={[
                {
                  tag: {
                    value: bang.kind === "ask" ? "Ask" : "Bang",
                    color: Color.Purple,
                  },
                },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Use ${bang.trigger}`}
                    icon={Icon.ArrowRight}
                    onAction={() => enterBangScope(bang)}
                  />
                  {prefixBang?.id === bang.id && jumpTargetId && (
                    <JumpToAction
                      onJump={() => enterBangScope(bang)}
                    />
                  )}
                  {closeAction()}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      );
    }

    if (section === "answers") {
      if (!inlineAnswer) return null;
      return (
        <List.Section key="answers" title="Answer">
          <List.Item
            id={`answer-${inlineAnswer.id}`}
            title={inlineAnswer.title}
            subtitle={inlineAnswer.subtitle}
            icon={Icon.Calculator}
            accessories={[{ text: "Enter to copy" }]}
            actions={
              <ActionPanel>
                <Action
                  title="Copy Result"
                  icon={Icon.Clipboard}
                  onAction={() =>
                    runAndClose(async () => {
                      await Clipboard.copy(inlineAnswer.copyText);
                      await showToast({
                        style: Toast.Style.Success,
                        title: "Copied",
                        message: inlineAnswer.copyText,
                      });
                    })
                  }
                />
              </ActionPanel>
            }
          />
        </List.Section>
      );
    }

    if (section === "search") {
      if (!primaryTitle || !app || !browser) return null;
      return (
        <List.Section key="search" title="Search">
          <List.Item
            id={NEW_SEARCH_ITEM_ID}
            title={primaryTitle}
            icon={Icon.MagnifyingGlass}
            accessories={[
              { text: browser.name },
              ...(jumpTargetId ? [{ text: "Tab", icon: Icon.ArrowRight }] : []),
            ]}
            actions={
              <ActionPanel>
                <Action
                  title={classified.kind === "url" ? "Open URL" : "Search Web"}
                  icon={Icon.Globe}
                  onAction={() =>
                    runAndClose(async () => {
                      await openQueryInBrowser(app, searchText);
                    })
                  }
                />
                {jumpTargetId && (
                  <JumpToAction onJump={jumpToActionOrBang} />
                )}
                {closeAction()}
              </ActionPanel>
            }
          />
        </List.Section>
      );
    }

    if (section === "history") {
      if (filteredHistory.length === 0 || !app) return null;
      const query = searchText.trim();
      return (
        <List.Section
          key="history"
          title={query ? "History" : "Recent"}
          subtitle={`${filteredHistory.length}`}
        >
          {filteredHistory.map((item) => (
            <HistoryListItem
              key={historyItemId(item.url)}
              item={item}
              onOpen={() =>
                runAndClose(async () => {
                  await openInBrowser(app, item.url);
                })
              }
              onSearchQuery={
                app
                  ? () =>
                      runAndClose(async () => {
                        await openQueryInBrowser(app, searchText);
                      })
                  : undefined
              }
              onJumpToAction={
                jumpTargetId ? jumpToActionOrBang : undefined
              }
              trailingActions={closeAction()}
            />
          ))}
        </List.Section>
      );
    }

    if (section === "bookmarks") {
      if (filteredBookmarks.length === 0 || !app) return null;
      return (
        <List.Section
          key="bookmarks"
          title="Bookmarks"
          subtitle={`${filteredBookmarks.length}`}
        >
          {filteredBookmarks.map((item) => (
            <List.Item
              key={`bm-${item.id}`}
              id={`bm-${item.id}`}
              title={item.title}
              subtitle={item.folderPath || item.domain}
              icon={Icon.Bookmark}
              accessories={[
                {
                  tag: { value: "Bookmark", color: Color.SecondaryText },
                },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Open"
                    icon={Icon.Globe}
                    onAction={() =>
                      runAndClose(async () => {
                        await openInBrowser(app, item.url);
                      })
                    }
                  />
                  {jumpTargetId && <JumpToAction onJump={jumpToAction} />}
                  <Action.CopyToClipboard
                    title="Copy URL"
                    content={sanitizeUrl(item.url)}
                  />
                  <Action.CopyToClipboard
                    title="Copy as Markdown"
                    content={formatMarkdownLink(item.title, item.url)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      );
    }

    if (section === "commands") {
      if (filteredCommands.length === 0) return null;
      return (
        <List.Section
          key="commands"
          title={actionScoped ? "Actions" : "Commands"}
          subtitle={`${filteredCommands.length}`}
        >
          {filteredCommands.map((command) => (
            <List.Item
              key={command.id}
              id={commandItemId(command.id)}
              title={command.title}
              subtitle={command.category}
              icon={Icon.Terminal}
              accessories={[
                ...(command.shortcut ? [{ text: command.shortcut }] : []),
                { tag: { value: "Command", color: Color.Blue } },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title={command.title}
                    icon={Icon.Terminal}
                    onAction={() => executeCommand(command)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      );
    }

    // actions section: sites + tabs + extensions
    if (actionScoped) return null;
    const query = searchText.trim();
    const hasActions =
      siteMatches.length > 0 ||
      filteredTabs.length > 0 ||
      filteredExtensions.length > 0;
    if (!hasActions || !app || !browser) return null;

    return (
      <List.Section
        key="actions"
        title={query ? "Open Tabs & Sites" : "Open Tabs"}
        subtitle={
          query
            ? keywordEngine
              ? `Tab → ${keywordEngine.name}`
              : `${
                  siteMatches.length +
                  filteredTabs.length +
                  filteredExtensions.length
                }`
            : `${filteredTabs.length}`
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
                : query
                  ? `for “${query}”`
                  : undefined
            }
            icon={{
              source: Icon.MagnifyingGlass,
              tintColor:
                keywordEngine?.id === site.id ? engineBadgeColor : undefined,
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
                    query && keywordEngine?.id !== site.id
                      ? `Search ${site.name}`
                      : `Search ${site.name}…`
                  }
                  icon={Icon.MagnifyingGlass}
                  onAction={() => {
                    if (query && keywordEngine?.id !== site.id) {
                      runAndClose(async () => {
                        await openInBrowser(app, site.buildUrl(query));
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
        {filteredTabs.map((tab) => (
          <TabItem
            key={tabItemId(tab)}
            tab={tab}
            engines={siteEngines}
            keywordEngine={keywordEngine}
            onJump={() =>
              runAndClose(async () => {
                await jumpToTab(app, browser, tab);
              })
            }
            onScope={(site) => enterSiteSearch(site)}
          />
        ))}
        {filteredExtensions.map((ext) => (
          <List.Item
            key={ext.id}
            id={`ext-${ext.id}`}
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
                      await openInBrowser(app, ext.detailsUrl);
                    })
                  }
                />
                {ext.optionsUrl ? (
                  <Action
                    title="Open Options"
                    icon={Icon.Gear}
                    onAction={() => {
                      const optionsUrl = ext.optionsUrl;
                      if (!optionsUrl) return;
                      runAndClose(async () => {
                        await openInBrowser(app, optionsUrl);
                      });
                    }}
                  />
                ) : null}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    );
  }

  const navigationTitle = browser?.name ?? "Omnibar";

  return (
    <List
      isLoading={isLoading}
      navigationTitle={navigationTitle}
      searchBarPlaceholder={placeholder}
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      filtering={false}
      throttle
      selectedItemId={selectedItemId}
      onSelectionChange={(id) => {
        const next = id ?? undefined;
        const pin = selectionPin.current;
        if (pin) {
          if (next !== pin.id) return;
          selectionPin.current = null;
        }
        setSelectedItemId(next);
      }}
    >
      {scopedSite || scopedBang ? (
        <>
          {scopedBang?.kind === "ask" && (
            <List.Section title="@Ask">
              <List.Item
                id={SCOPED_SEARCH_ITEM_ID}
                title={
                  searchText.trim()
                    ? `Ask “${searchText.trim()}”`
                    : "Type a question…"
                }
                subtitle={askLoading ? "Thinking…" : askAnswer ?? undefined}
                icon={Icon.SpeechBubble}
                actions={
                  <ActionPanel>
                    <Action
                      title="Ask"
                      icon={Icon.SpeechBubble}
                      onAction={() => {
                        void runAsk(searchText.trim());
                      }}
                    />
                    {askAnswer ? (
                      <Action.CopyToClipboard
                        title="Copy Answer"
                        content={askAnswer}
                      />
                    ) : null}
                    <Action
                      title="Exit Bang"
                      icon={Icon.Undo}
                      shortcut={{ modifiers: [], key: "backspace" }}
                      onAction={() => {
                        setScopedBang(null);
                        setAskAnswer(null);
                        setSearchText("");
                      }}
                    />
                    {closeAction()}
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {scopedBang && scopedBang.kind === "site" && primaryTitle && app && (
            <List.Section title={scopedBang.trigger}>
              <List.Item
                id={SCOPED_SEARCH_ITEM_ID}
                title={primaryTitle}
                icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Red }}
                accessories={[
                  {
                    tag: {
                      value: scopedBang.trigger,
                      color: Color.Red,
                    },
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title={`Search ${scopedBang.name}`}
                      icon={Icon.MagnifyingGlass}
                      onAction={() =>
                        runAndClose(async () => {
                          bumpBangUsage(scopedBang.id);
                          await openInBrowser(
                            app,
                            buildBangSearchUrl(
                              scopedBang,
                              searchText.trim(),
                            ),
                          );
                        })
                      }
                    />
                    <Action
                      title="Exit Bang"
                      icon={Icon.Undo}
                      shortcut={{ modifiers: [], key: "backspace" }}
                      onAction={() => {
                        setScopedBang(null);
                        setSearchText("");
                      }}
                    />
                    {closeAction()}
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {scopedSite && primaryTitle && app && (
            <List.Section title={scopedSite.name}>
              <List.Item
                id={SCOPED_SEARCH_ITEM_ID}
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
                    {closeAction()}
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {scopedSite && !searchText.trim() && (
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
                    {closeAction()}
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {scopedHistory.length > 0 && app && (
            <List.Section
              title={searchText.trim() ? "History" : "Recent"}
              subtitle={`${scopedHistory.length}`}
            >
              {scopedHistory.map((item) => (
                <HistoryListItem
                  key={historyItemId(item.url)}
                  item={item}
                  onOpen={() =>
                    runAndClose(async () => {
                      await openInBrowser(app, item.url);
                    })
                  }
                  trailingActions={closeAction()}
                />
              ))}
            </List.Section>
          )}
          {scopedSuggestions.length > 0 && (scopedSite || scopedBang) && (
            <List.Section title="Suggestions">
              {scopedSuggestions.map((suggestion) => {
                const scopeName =
                  scopedSite?.name ?? scopedBang?.name ?? "Search";
                const buildScopedUrl = (q: string) => {
                  if (scopedSite) return scopedSite.buildUrl(q);
                  if (scopedBang) return buildBangSearchUrl(scopedBang, q);
                  return q;
                };
                return (
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
                        value: scopeName,
                        color: Color.Red,
                      },
                    },
                  ]}
                  actions={
                    <ActionPanel>
                      <Action
                        title={`Search ${scopeName}`}
                        icon={Icon.MagnifyingGlass}
                        onAction={() =>
                          runAndClose(async () => {
                            if (!app) return;
                            await openInBrowser(
                              app,
                              buildScopedUrl(suggestion),
                            );
                          })
                        }
                      />
                      <Action
                        title="Exit Scope"
                        icon={Icon.Undo}
                        onAction={() => {
                          setScopedSite(null);
                          setScopedBang(null);
                        }}
                      />
                      {closeAction()}
                    </ActionPanel>
                  }
                />
              );
              })}
            </List.Section>
          )}
        </>
      ) : (
        <>
          {sectionsForQuery(searchText).map((section) =>
            renderUnscopedSection(section),
          )}

          {globalSuggestions.length > 0 && app && (
            <List.Section title="Suggestions">
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
                      {jumpTargetId && <JumpToAction onJump={jumpToAction} />}
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          )}

          {!isLoading &&
            tabs.length === 0 &&
            filteredHistory.length === 0 &&
            filteredCommands.length === 0 &&
            !searchText.trim() && (
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

function JumpToAction(props: { onJump: () => void }) {
  return (
    <Action
      title="Jump to Action"
      icon={Icon.ArrowRight}
      shortcut={{ modifiers: [], key: "tab" }}
      onAction={props.onJump}
    />
  );
}

function HistoryListItem(props: {
  item: HistoryItem;
  onOpen: () => void;
  onSearchQuery?: () => void;
  onJumpToAction?: () => void;
  trailingActions?: ReactNode;
}) {
  const { item, onOpen, onSearchQuery, onJumpToAction, trailingActions } =
    props;
  return (
    <List.Item
      id={historyItemId(item.url)}
      title={item.title}
      subtitle={item.domain}
      icon={Icon.Clock}
      accessories={[{ tag: { value: "History", color: Color.SecondaryText } }]}
      actions={
        <ActionPanel>
          <Action title="Open" icon={Icon.Globe} onAction={onOpen} />
          {onSearchQuery && (
            <Action
              title="Search Query in Browser"
              icon={Icon.MagnifyingGlass}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              onAction={onSearchQuery}
            />
          )}
          {onJumpToAction && <JumpToAction onJump={onJumpToAction} />}
          <Action.CopyToClipboard
            title="Copy URL"
            content={sanitizeUrl(item.url)}
          />
          <Action.CopyToClipboard
            title="Copy as Markdown"
            content={formatMarkdownLink(item.title, item.url)}
          />
          {trailingActions}
        </ActionPanel>
      }
    />
  );
}

function TabItem(props: {
  tab: Tab;
  engines: SiteEngine[];
  keywordEngine: SiteEngine | null;
  onJump: () => void;
  onScope: (site: SiteEngine) => void;
}) {
  const { tab, engines, keywordEngine, onJump, onScope } = props;
  const tabSite = siteEngineFromTab(tab, engines);

  return (
    <List.Item
      id={tabItemId(tab)}
      title={tab.title}
      subtitle={tab.domain}
      icon={Icon.Link}
      accessories={[
        { tag: { value: "Switch to Tab", color: Color.Blue } },
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
          <Action.CopyToClipboard
            title="Copy URL"
            content={sanitizeUrl(tab.url)}
          />
          <Action.CopyToClipboard
            title="Copy as Markdown"
            content={formatMarkdownLink(tab.title, tab.url)}
          />
        </ActionPanel>
      }
    />
  );
}
