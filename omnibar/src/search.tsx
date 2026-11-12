import {
  Action,
  ActionPanel,
  Application,
  Clipboard,
  Color,
  Icon,
  Image,
  Keyboard,
  List,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  popToRoot,
  showToast,
} from "@raycast/api";
import { runAppleScript, useCachedPromise, usePromise } from "@raycast/utils";
import Fuse from "fuse.js";
import { homedir } from "os";
import { join } from "path";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createBrowserActions, type ActionEngine } from "./browser-actions";
import {
  BookmarkItem,
  filterBookmarks,
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
import { rememberFocusedProcess } from "./focused-browser";
import { contextFromHint } from "./hint-context";
import { resolveOmnibarContext } from "./resolve-frontmost-browser";
import { queryStateRecord } from "./dismiss";
import { shouldBlockList } from "./list-loading";
import { Tab, classifyInput } from "./classify";
import { BrowserCommand, filterCommands } from "./commands";
import {
  BrowserExtension,
  getInstalledExtensions,
  peekCachedExtensions,
} from "./extensions";
import { fallbackAppPath, listRowIcon } from "./app-icon";
import { recordAction } from "./action-log";
import { brandColor, historyLinkLogo, siteIcon } from "./site-mark";
import {
  matchingSpacePages,
  onScreenWindowsScript,
  parseOpenSpaceHeld,
  parseWindowNameLines,
} from "./open-pages";
import { evaluateInlineAnswer } from "./inline-answers";
import { askBridge } from "./ask-bridge";
import {
  FALLBACK_BANGS,
  bangForTab,
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
import {
  getDefaultSearchTemplate,
  peekDefaultSearchTemplate,
} from "./exact-search";
import {
  activateApplication,
  openExactSearchInNewTab,
  openInBrowser,
  openQueryInBrowser,
} from "./open";
import { scopedSubmitUrl } from "./submit-target";
import { shouldActivateBrowser, type CloseReason } from "./close-focus";
import {
  MRU_TAB_LIMIT,
  NEW_SEARCH_ITEM_ID,
  SCOPED_SEARCH_ITEM_ID,
  commandItemId,
  listAfterQuick,
  mruTabs,
  parseQueryScope,
  quickPicks,
  sectionsForQuery,
  uniqueBySite,
  uniqueLabels,
  selectionAfterReport,
  selectionAfterType,
  shouldResetSelection,
  tabItemId,
  tabJumpTarget,
  type ResultSection,
} from "./result-order";
import {
  clearedSession,
  loadSession,
  saveSession,
  sessionForOpen,
} from "./session";
import {
  FALLBACK_SITE_ENGINES,
  SiteEngine,
  fetchDuckDuckGoSuggestions,
  fetchGitHubSuggestions,
  fetchYouTubeSuggestions,
  suggestionKindForScope,
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
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  omnibarSupportDir,
  readLastBrowserHint,
  shouldApplyBrowserHint,
  freshStamp,
} from "./last-browser";
import { nextSearchEdit, shouldRestoreSession } from "./search-edit";

type ScopedSite = SiteEngine | null;

const SUGGESTION_DEBOUNCE_MS = 200;
/** Claims ⌘⏎ so Raycast does not pop to Recents. The action searches in a new tab. */
const openInBrowserShortcut: Keyboard.Shortcut = {
  modifiers: ["cmd"],
  key: "return",
};
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
  const hinted = useMemo(
    () =>
      contextFromHint(readLastBrowserHint(), prefs, (bundleId) =>
        fallbackAppPath(bundleId, homedir(), existsSync),
      ),
    [prefs],
  );
  const [searchText, setSearchText] = useState("");
  const [scopedSite, setScopedSite] = useState<ScopedSite>(null);
  const [scopedBang, setScopedBang] = useState<Bang | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [spaceOnly, setSpaceOnly] = useState(false);
  const [onScreenTitles, setOnScreenTitles] = useState<string[]>([]);
  const suggestionAbort = useRef<AbortController | null>(null);
  const selectionPin = useRef<string | undefined>(undefined);
  const selectionKeyRef = useRef<string | null>(null);
  const sessionRestored = useRef(false);
  const seenHint = useRef<{ bundleId: string; recordedAt: number } | undefined>(
    undefined,
  );
  const seenSubmit = useRef<number | undefined>(undefined);
  const seenTab = useRef<number | undefined>(undefined);
  const seenDismiss = useRef<number | undefined>(undefined);
  const searchTextRef = useRef(searchText);
  searchTextRef.current = searchText;
  const submitSearchRef = useRef<(query: string) => void>(() => {});
  const tabBangRef = useRef<Bang | undefined>(undefined);
  const applyTabRef = useRef<() => void>(() => {});
  const ignoreEmptySearch = useRef(false);
  const userEdited = useRef(false);
  const openedAtRef = useRef(Date.now());
  const loggedLoads = useRef(new Set<string>());
  const textVia = useRef("open");
  const lastSelection = useRef<string | undefined>(undefined);
  const dismissActionRef = useRef<(action: "close" | "exit-scope") => void>(
    () => {},
  );

  const {
    data: resolvedContext,
    isLoading: isLoadingContext,
    error: contextError,
    revalidate: revalidateContext,
  } = usePromise(async () => resolveOmnibarContext(prefs));
  const context = resolvedContext ?? hinted;
  if (context?.allowed) {
    rememberFocusedProcess(context.browser.bundleId, context.focusedPid);
  }
  const browserIdRef = useRef<string | undefined>(undefined);
  browserIdRef.current = context?.allowed
    ? context.browser.bundleId
    : undefined;

  const revalidateContextRef = useRef(revalidateContext);
  revalidateContextRef.current = revalidateContext;

  useEffect(() => {
    const tick = () => {
      const hint = readLastBrowserHint();
      const current = seenHint.current;
      if (!shouldApplyBrowserHint(current, hint) || !hint) return;
      seenHint.current = {
        bundleId: hint.bundleId,
        recordedAt: hint.recordedAt,
      };
      if (hint.bundleId !== browserIdRef.current) {
        sessionRestored.current = false;
        userEdited.current = false;
      }
      void revalidateContextRef.current();
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const activePath = join(omnibarSupportDir(), "omnibar-active");
    const submitPath = join(omnibarSupportDir(), "pending-submit.json");
    const tabPath = join(omnibarSupportDir(), "pending-tab.json");
    const dismissPath = join(omnibarSupportDir(), "pending-dismiss.json");
    const modifierPath = join(omnibarSupportDir(), "modifier-state.json");
    const hintPath = join(omnibarSupportDir(), "last-browser.json");
    const readStamp = (
      path: string,
    ): { recordedAt?: number; action?: string } => {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as {
          recordedAt?: number;
          action?: string;
        };
        return parsed;
      } catch {
        return {};
      }
    };
    const stampTime = (path: string): number | undefined => {
      const recordedAt = readStamp(path).recordedAt;
      return typeof recordedAt === "number" ? recordedAt : undefined;
    };
    const beat = () => {
      try {
        writeFileSync(activePath, String(Date.now()));
      } catch {
        // The support directory can be missing for one tick.
      }
    };
    beat();
    const openedAt = Date.now();
    const initialSubmit = freshStamp(
      openedAt,
      undefined,
      stampTime(submitPath),
    );
    const initialTab = freshStamp(openedAt, undefined, stampTime(tabPath));
    const initialDismiss = freshStamp(
      openedAt,
      undefined,
      stampTime(dismissPath),
    );
    seenSubmit.current = initialSubmit.seen;
    seenTab.current = initialTab.seen;
    seenDismiss.current = initialDismiss.seen;
    const timer = setInterval(() => {
      beat();
      const submit = freshStamp(
        openedAt,
        seenSubmit.current,
        stampTime(submitPath),
      );
      seenSubmit.current = submit.seen;
      if (submit.run) {
        const query = searchTextRef.current;
        recordAction({
          kind: "shortcut",
          key: "cmd+return",
          q: query,
          run: query.trim().length > 0,
        });
        if (query.trim()) submitSearchRef.current(query.trim());
      }
      const tab = freshStamp(openedAt, seenTab.current, stampTime(tabPath));
      seenTab.current = tab.seen;
      if (tab.run) {
        recordAction({
          kind: "shortcut",
          key: "tab",
          q: searchTextRef.current,
          bang: tabBangRef.current?.id ?? "",
        });
        applyTabRef.current();
      }
      const dismiss = freshStamp(
        openedAt,
        seenDismiss.current,
        stampTime(dismissPath),
      );
      seenDismiss.current = dismiss.seen;
      if (dismiss.run) {
        const action = readStamp(dismissPath).action;
        if (action === "exit-scope" || action === "close") {
          dismissActionRef.current(action);
        }
      }
      let held = false;
      try {
        held = parseOpenSpaceHeld(readFileSync(modifierPath, "utf8"));
      } catch {
        held = false;
      }
      setSpaceOnly((current) => (current === held ? current : held));
    }, 150);
    const windowsTimer = setInterval(() => {
      let bundleId = "";
      try {
        const hint = JSON.parse(readFileSync(hintPath, "utf8")) as {
          bundleId?: unknown;
        };
        if (typeof hint.bundleId === "string") bundleId = hint.bundleId;
      } catch {
        return;
      }
      if (!bundleId) return;
      void runAppleScript(onScreenWindowsScript(bundleId))
        .then((raw) => {
          const titles = parseWindowNameLines(raw);
          setOnScreenTitles((current) =>
            current.join("\n") === titles.join("\n") ? current : titles,
          );
        })
        .catch(() => {
          // System Events can refuse before Automation access is granted.
        });
    }, 1000);
    recordAction({ kind: "window", phase: "open" });
    return () => {
      clearInterval(timer);
      clearInterval(windowsTimer);
      recordAction({
        kind: "window",
        phase: "unmount",
        ms: Date.now() - openedAt,
      });
      // Trackpad gestures and click-away land here. They must not activate the browser.
      try {
        unlinkSync(activePath);
      } catch {
        // already removed
      }
    };
  }, []);

  useEffect(() => {
    if (!context) return;
    if (!context.allowed) {
      void (async () => {
        await popToRoot({ clearSearchBar: true });
        await closeMainWindow({ clearRootSearch: true });
      })();
      return;
    }
    if (
      !shouldRestoreSession({
        alreadyRestored: sessionRestored.current,
        userEdited: userEdited.current,
      })
    ) {
      sessionRestored.current = true;
      return;
    }
    sessionRestored.current = true;
    textVia.current = "session";
    const next = sessionForOpen({
      session: loadSession(context.browser.bundleId),
      now: Date.now(),
    });
    setSearchText(next.searchText);
    setAskAnswer(null);
    setScopedSite(null);
    setScopedBang(null);
    if (next.scopedKind === "site" && next.scopedId) {
      const engines =
        siteEnginesFromKeywords(
          peekCachedEngines(context.browser.bundleId) ?? [],
        ) || FALLBACK_SITE_ENGINES;
      const site =
        engines.find((e) => e.id === next.scopedId) ??
        FALLBACK_SITE_ENGINES.find((e) => e.id === next.scopedId);
      if (site) setScopedSite(site);
    }
    if (next.scopedKind === "bang" && next.scopedId) {
      const bang = FALLBACK_BANGS.find((b) => b.id === next.scopedId);
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

  useEffect(() => {
    recordAction({
      kind: "type",
      q: searchText,
      via: textVia.current,
      bang: scopedBang?.id ?? "",
      site: scopedSite?.id ?? "",
    });
    try {
      writeFileSync(
        join(omnibarSupportDir(), "query-state.json"),
        JSON.stringify(
          queryStateRecord({
            searchText,
            scoped: Boolean(scopedBang || scopedSite),
          }),
        ),
      );
    } catch {
      // The support directory can be missing for one tick.
    }
  }, [searchText, scopedBang, scopedSite]);

  useEffect(() => {
    if (!context) return;
    const key = context.allowed
      ? `context:${context.browser.bundleId}:${context.frontmost.path}`
      : "context:denied";
    if (loggedLoads.current.has(key)) return;
    loggedLoads.current.add(key);
    if (!context.allowed) {
      recordAction({
        kind: "context",
        allowed: false,
        ms: Date.now() - openedAtRef.current,
      });
      return;
    }
    recordAction({
      kind: "context",
      allowed: true,
      ms: Date.now() - openedAtRef.current,
      browser: context.browser.name,
      bundleId: context.browser.bundleId,
      path: context.frontmost.path,
    });
  }, [context]);

  useEffect(() => {
    if (!contextError) return;
    recordAction({
      kind: "error",
      where: "context",
      message: String(contextError),
    });
  }, [contextError]);

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
    if (
      parsed.bangToken.toLowerCase() === bang.id.toLowerCase() ||
      `@${parsed.bangToken}`.toLowerCase() === bang.trigger.toLowerCase()
    ) {
      enterBangScope(bang);
      setSearchText(parsed.rest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, scopedBang, scopedSite]);

  const bundleId = context?.frontmost?.bundleId ?? "";
  const cachedTabs = bundleId ? (peekCachedTabs(bundleId) ?? []) : [];
  const cachedHistory = bundleId ? (peekCachedHistory(bundleId) ?? []) : [];
  const cachedBookmarks = bundleId ? (peekCachedBookmarks(bundleId) ?? []) : [];
  const cachedExtensions = bundleId
    ? (peekCachedExtensions(bundleId) ?? [])
    : [];
  const cachedEngines = bundleId ? (peekCachedEngines(bundleId) ?? []) : [];
  const cachedDefaultSearch = bundleId
    ? peekDefaultSearchTemplate(bundleId)
    : undefined;

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

  const { data: defaultSearchTemplate = cachedDefaultSearch } =
    useCachedPromise(
      async (id: string) => {
        const browser = findBrowserByBundleId(id);
        if (!browser) return undefined;
        return getDefaultSearchTemplate(browser);
      },
      [bundleId],
      {
        execute: Boolean(context?.allowed && bundleId),
        initialData: cachedDefaultSearch,
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

  useEffect(() => {
    if (!context?.allowed) return;
    const loads = [
      { what: "history", loading: isLoadingHistory, count: history.length },
      { what: "tabs", loading: isLoadingTabs, count: tabs.length },
      {
        what: "bookmarks",
        loading: isLoadingBookmarks,
        count: bookmarks.length,
      },
      {
        what: "extensions",
        loading: isLoadingExtensions,
        count: extensions.length,
      },
    ];
    for (const load of loads) {
      if (load.loading) continue;
      const key = `${bundleId}:${load.what}:${load.count}`;
      if (loggedLoads.current.has(key)) continue;
      loggedLoads.current.add(key);
      recordAction({
        kind: "load",
        what: load.what,
        ms: Date.now() - openedAtRef.current,
        count: load.count,
        browser: context.browser.name,
        bundleId,
      });
    }
  }, [
    context,
    bundleId,
    isLoadingHistory,
    history.length,
    isLoadingTabs,
    tabs.length,
    isLoadingBookmarks,
    bookmarks.length,
    isLoadingExtensions,
    extensions.length,
  ]);

  const suggestionsEnabled = prefs.enableSuggestions !== false;
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SUGGESTION_DEBOUNCE_MS,
  );

  const queryScope = parseQueryScope(searchText);
  const filterScope = queryScope;
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
  const suggestionKind = suggestionKindForScope({
    bangId:
      scopedBang?.id ??
      (scopedSite && isYouTubeEngine(scopedSite) ? "youtube" : undefined),
    domains: scopedBang?.domains ?? scopedSite?.domains,
  });

  const { data: suggestions = [] } = useCachedPromise(
    async (query: string, kind: string) => {
      if (!query) return [] as string[];
      if (kind === "youtube") {
        return fetchYouTubeSuggestions(query, suggestionAbort.current?.signal);
      }
      if (kind === "github") {
        return fetchGitHubSuggestions(query, suggestionAbort.current?.signal);
      }
      return fetchDuckDuckGoSuggestions(query, suggestionAbort.current?.signal);
    },
    [suggestionQuery, suggestionKind],
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
  }, [actionScoped, bangListing, domainScope, filterQuery, history]);

  const filteredBookmarks = useMemo(() => {
    if (actionScoped || bangListing) return [] as BookmarkItem[];
    const domainFiltered =
      domainScope && domainScope.length > 0
        ? filterBookmarks(bookmarks, "", domainScope, 200)
        : bookmarks;
    const q = filterQuery;
    if (!q) return domainFiltered.slice(0, BOOKMARK_LIMIT);
    return new Fuse(domainFiltered, {
      keys: ["title", "url", "domain", "folderPath"],
      threshold: 0.4,
      ignoreLocation: true,
    })
      .search(q)
      .map((r) => r.item)
      .slice(0, BOOKMARK_LIMIT);
  }, [actionScoped, bangListing, domainScope, filterQuery, bookmarks]);

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

  const commandEngine = context?.allowed ? context.browser.engine : undefined;
  const filteredCommands = useMemo(() => {
    const q =
      filterScope.mode === "commands"
        ? filterScope.filterQuery
        : actionScoped
          ? ""
          : filterQuery;
    // Empty unified query → suggested; `/ ` with no filter → suggested; else match
    if (filterScope.mode === "commands") {
      return filterCommands(q, commandEngine, COMMAND_LIMIT);
    }
    if (!filterQuery) return filterCommands("", commandEngine, COMMAND_LIMIT);
    return filterCommands(filterQuery, commandEngine, COMMAND_LIMIT);
  }, [actionScoped, commandEngine, filterQuery, filterScope]);

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
  const isLoading = shouldBlockList({
    hasHint: Boolean(hinted?.allowed),
    contextReady: Boolean(context?.allowed) && !isLoadingContext,
    hasCachedRows: hasCachedData,
    listsLoading:
      isLoadingTabs ||
      isLoadingExtensions ||
      isLoadingHistory ||
      isLoadingBookmarks,
  });

  const tabBang = bangForTab(searchText, bangCatalog, bangUsage);
  const prefixBang = tabBang;

  const jumpTargetId =
    scopedSite || scopedBang || actionScoped
      ? undefined
      : tabJumpTarget({
          query: searchText,
          bangIds: prefixBang
            ? [prefixBang.id]
            : filteredBangs.map((b) => b.id),
          siteIds: siteMatches.map((site) => site.id),
          tabs: filteredTabs.map((tab) => ({
            windowId: tab.windowId,
            tabId: tab.tabId,
            url: tab.url,
          })),
          extensionIds: filteredExtensions.map((ext) => ext.id),
          commandIds: filteredCommands.map((cmd) => cmd.id),
        });

  const selectionKey = `${scopedBang?.id ?? scopedSite?.id ?? ""}|${searchText}`;
  useEffect(() => {
    if (
      !shouldResetSelection({
        previousQueryKey: selectionKeyRef.current,
        nextQueryKey: selectionKey,
      })
    ) {
      return;
    }
    selectionKeyRef.current = selectionKey;
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
    selectionPin.current = id;
    setSelectedItemId(id);
  }, [
    selectionKey,
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
  const rowIcon = listRowIcon(app?.path ?? "") ?? Icon.MagnifyingGlass;

  function websiteIcon(domains: readonly string[] | undefined) {
    const icon = domains ? siteIcon(domains) : null;
    if (!icon) return rowIcon;
    return {
      source: icon.source,
      mask: icon.mask ?? Image.Mask.RoundedRectangle,
      fallback: Icon.Globe,
    };
  }

  async function closeOmnibarFully(reason: CloseReason) {
    recordAction({ kind: "close-request", q: searchText, reason });
    const bundleId = browser?.bundleId;
    if (bundleId) saveSession(bundleId, clearedSession());
    await popToRoot({ clearSearchBar: true });
    await closeMainWindow({ clearRootSearch: true });
    if (shouldActivateBrowser(reason) && app) {
      await activateApplication(app);
    }
  }

  function exitScope() {
    textVia.current = "exit-scope";
    recordAction({
      kind: "scope",
      phase: "exit",
      via: "backspace",
      bang: scopedBang?.id ?? "",
      site: scopedSite?.id ?? "",
    });
    setScopedSite(null);
    setScopedBang(null);
    setAskAnswer(null);
    setSearchText("");
  }

  dismissActionRef.current = (action) => {
    if (action === "exit-scope") {
      exitScope();
      return;
    }
    void closeOmnibarFully("escape");
  };

  async function runAndClose(action: () => Promise<void>, label = "open") {
    const started = Date.now();
    try {
      await action();
      recordAction({
        kind: "execute",
        label,
        ok: true,
        ms: Date.now() - started,
        q: searchText,
      });
    } catch (error) {
      recordAction({
        kind: "execute",
        label,
        ok: false,
        ms: Date.now() - started,
        q: searchText,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    await closeOmnibarFully("open");
  }

  async function submitExactSearch(query: string) {
    if (!app || !browser) return;
    const started = Date.now();
    const opened = await openExactSearchInNewTab({
      app,
      browserName: browser.name,
      engine: browser.engine,
      query,
      template: getDefaultSearchTemplate(browser) ?? defaultSearchTemplate,
      fallback: prefs.searchEngine,
    });
    recordAction({
      kind: "execute",
      label: "exact-search",
      ok: opened,
      ms: Date.now() - started,
      q: query,
      browser: browser.name,
    });
    if (!opened) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not open a new tab",
        message: browser.name,
      });
      return;
    }
    await closeOmnibarFully("submit");
  }

  async function submitFromBar(query: string) {
    const decision = scopedSubmitUrl({
      query,
      bang: scopedBang,
      site: scopedSite,
    });
    if (decision.kind === "ignore" || !app || !browser) return;
    if (decision.kind === "engine") {
      await submitExactSearch(decision.query);
      return;
    }
    const started = Date.now();
    try {
      if (scopedBang?.kind === "site") bumpBangUsage(scopedBang.id);
      await openInBrowser(app, decision.url);
      recordAction({
        kind: "execute",
        label: "scoped-search",
        ok: true,
        ms: Date.now() - started,
        q: query,
        bang: scopedBang?.id ?? "",
        site: scopedSite?.id ?? "",
      });
    } catch (error) {
      recordAction({
        kind: "execute",
        label: "scoped-search",
        ok: false,
        ms: Date.now() - started,
        q: query,
        error: error instanceof Error ? error.message : String(error),
      });
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not open the page",
        message: browser.name,
      });
      return;
    }
    await closeOmnibarFully("submit");
  }

  submitSearchRef.current = (query: string) => {
    void submitFromBar(query);
  };

  function exactSearchAction() {
    if (!app || !browser) return null;
    const query = searchText.trim();
    return (
      <Action
        title="Search in New Tab"
        icon={Icon.MagnifyingGlass}
        shortcut={openInBrowserShortcut}
        onAction={() => {
          if (!query) return;
          void submitFromBar(query);
        }}
      />
    );
  }

  function enterSiteSearch(site: SiteEngine) {
    userEdited.current = true;
    ignoreEmptySearch.current = true;
    textVia.current = "scope";
    recordAction({
      kind: "scope",
      phase: "enter",
      site: site.id,
      name: site.name,
    });
    setScopedBang(null);
    setScopedSite(site);
    setSearchText("");
  }

  function enterBangScope(bang: Bang) {
    userEdited.current = true;
    ignoreEmptySearch.current = true;
    textVia.current = "scope";
    bumpBangUsage(bang.id);
    recordAction({
      kind: "scope",
      phase: "enter",
      bang: bang.id,
      trigger: bang.trigger,
    });
    setScopedSite(null);
    setScopedBang(bang);
    setAskAnswer(null);
    setSearchText("");
    setSelectedItemId(SCOPED_SEARCH_ITEM_ID);
  }

  tabBangRef.current = tabBang;
  applyTabRef.current = () => {
    const bang = tabBangRef.current;
    if (!bang) return;
    enterBangScope(bang);
  };

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
    selectionPin.current = jumpTargetId;
    setSelectedItemId(jumpTargetId);
  }

  function handleSearchTextChange(next: string) {
    textVia.current = "user";
    const edit = nextSearchEdit({
      scoped: Boolean(scopedSite || scopedBang),
      searchText,
      next,
      ignoringEmpty: ignoreEmptySearch.current,
    });
    if (edit === "ignore-clear" || edit === "keep-scope") {
      if (edit === "keep-scope") ignoreEmptySearch.current = false;
      setSearchText("");
      return;
    }
    if (edit === "exit-scope") {
      textVia.current = "exit-scope";
      recordAction({
        kind: "scope",
        phase: "exit",
        via: "backspace",
        bang: scopedBang?.id ?? "",
        site: scopedSite?.id ?? "",
      });
      setScopedSite(null);
      setScopedBang(null);
      setAskAnswer(null);
      return;
    }
    if (next.length > 0) userEdited.current = true;
    ignoreEmptySearch.current = false;
    setSearchText(next);
  }

  function jumpToActionOrBang() {
    if (prefixBang && !scopedBang && !searchText.includes(" ")) {
      enterBangScope(prefixBang);
      return;
    }
    jumpToAction();
  }

  function tabScopeAction() {
    if (!tabBang) return null;
    return <TabToBang bang={tabBang} onComplete={enterBangScope} />;
  }

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
        onAction={() => {
          void closeOmnibarFully("escape");
        }}
      />
    );
  }

  function renderQuickSection(
    historyItems: HistoryItem[],
    suggestionItems: readonly string[],
    openSuggestion: (suggestion: string) => void,
    suggestionIcon: List.Item.Props["icon"],
  ) {
    const historyPreview = quickPicks(historyItems);
    const suggestionPreview = quickPicks(suggestionItems);
    if (
      (historyPreview.length === 0 && suggestionPreview.length === 0) ||
      !app
    ) {
      return null;
    }
    return (
      <List.Section key="quick" title="Quick">
        {suggestionPreview.map((suggestion) => (
          <List.Item
            key={`quick-sug-${suggestion}`}
            id={`quick-sug-${suggestion}`}
            title={suggestion}
            icon={suggestionIcon}
            accessories={[
              { tag: { value: "Suggestion", color: Color.SecondaryText } },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Search"
                  icon={Icon.MagnifyingGlass}
                  onAction={() => openSuggestion(suggestion)}
                />
                {closeAction()}
                {exactSearchAction()}
              </ActionPanel>
            }
          />
        ))}
        {historyPreview.map((item) => (
          <HistoryListItem
            key={`quick-${historyItemId(item.url)}`}
            id={`quick-${historyItemId(item.url)}`}
            item={item}
            onOpen={() =>
              runAndClose(async () => {
                await openInBrowser(app, item.url);
              })
            }
            tabAction={tabScopeAction()}
            trailingActions={closeAction()}
            searchAction={exactSearchAction()}
          />
        ))}
      </List.Section>
    );
  }

  function renderUnscopedSection(section: ResultSection) {
    if (section === "bangs") {
      if (filteredBangs.length === 0) return null;
      return (
        <List.Section
          key="bangs"
          title="Bangs"
          subtitle={`${filteredBangs.length}`}
        >
          {filteredBangs.map((bang) => (
            <List.Item
              key={bang.id}
              id={bangItemId(bang.id)}
              title={bang.trigger}
              subtitle={bang.name}
              icon={
                bang.kind === "ask"
                  ? Icon.SpeechBubble
                  : websiteIcon(bang.domains)
              }
              accessories={[
                {
                  tag: {
                    value: bang.kind === "ask" ? "Ask" : bang.trigger,
                    color:
                      bang.kind === "ask"
                        ? Color.Purple
                        : brandColor(bang.id, bang.domains),
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
                  {tabScopeAction()}
                  {closeAction()}
                  {exactSearchAction()}
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
                {tabScopeAction()}
                {exactSearchAction()}
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
            icon={rowIcon}
            accessories={[
              { text: browser.name },
              ...(tabBang
                ? [{ text: tabBang.trigger, icon: Icon.ArrowRight }]
                : jumpTargetId
                  ? [{ text: "Tab", icon: Icon.ArrowRight }]
                  : []),
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
                {tabBang ? (
                  <TabToBang bang={tabBang} onComplete={enterBangScope} />
                ) : (
                  jumpTargetId && <JumpToAction onJump={jumpToActionOrBang} />
                )}
                {closeAction()}
                {exactSearchAction()}
              </ActionPanel>
            }
          />
        </List.Section>
      );
    }

    if (section === "space") {
      if (!app || !browser) return null;
      const pages = matchingSpacePages(tabs, onScreenTitles, filterQuery);
      if (pages.length === 0) return null;
      return (
        <List.Section
          key="space"
          title="On This Space"
          subtitle={`${pages.length}`}
        >
          {pages.map((tab) => (
            <List.Item
              key={`space-${tabItemId(tab)}`}
              id={`space-${tabItemId(tab)}`}
              title={tab.title}
              subtitle={tab.domain}
              icon={websiteIcon([tab.domain])}
              accessories={[{ tag: { value: "Open", color: Color.Green } }]}
              actions={
                <ActionPanel>
                  <Action
                    title="Switch to Tab"
                    icon={Icon.ArrowRight}
                    onAction={() =>
                      runAndClose(async () => {
                        await jumpToTab(app, browser, tab);
                      })
                    }
                  />
                  {closeAction()}
                  {exactSearchAction()}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      );
    }

    if (section === "quick") {
      return renderQuickSection(
        uniqueBySite(filteredHistory),
        uniqueLabels(globalSuggestions),
        (suggestion) => {
          runAndClose(async () => {
            if (!app) return;
            await openQueryInBrowser(app, suggestion);
          });
        },
        Icon.Text,
      );
    }

    if (section === "history") {
      const historyRest = listAfterQuick(uniqueBySite(filteredHistory));
      if (historyRest.length === 0 || !app) return null;
      const query = searchText.trim();
      return (
        <List.Section
          key="history"
          title={query ? "History" : "Recent"}
          subtitle={`${historyRest.length}`}
        >
          {historyRest.map((item) => (
            <HistoryListItem
              key={historyItemId(item.url)}
              item={item}
              icon={
                domainScope && domainScope.length > 0
                  ? websiteIcon(domainScope)
                  : undefined
              }
              tag={
                activeBang && domainScope && domainScope.length > 0
                  ? {
                      value: activeBang.trigger,
                      color: brandColor(activeBang.id, activeBang.domains),
                    }
                  : undefined
              }
              onOpen={() =>
                runAndClose(async () => {
                  await openInBrowser(app, item.url);
                })
              }
              onJumpToAction={
                tabBang
                  ? undefined
                  : jumpTargetId
                    ? jumpToActionOrBang
                    : undefined
              }
              tabAction={tabScopeAction()}
              trailingActions={closeAction()}
              searchAction={exactSearchAction()}
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
                  {tabBang
                    ? tabScopeAction()
                    : jumpTargetId && <JumpToAction onJump={jumpToAction} />}
                  <Action.CopyToClipboard
                    title="Copy URL"
                    content={sanitizeUrl(item.url)}
                  />
                  <Action.CopyToClipboard
                    title="Copy as Markdown"
                    content={formatMarkdownLink(item.title, item.url)}
                  />
                  {exactSearchAction()}
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
                  {tabBang && (
                    <TabToBang bang={tabBang} onComplete={enterBangScope} />
                  )}
                  {exactSearchAction()}
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
            ? tabBang
              ? `Tab → ${tabBang.trigger}`
              : keywordEngine
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
              tabBang
                ? `Tab → ${tabBang.trigger}`
                : keywordEngine?.id === site.id
                  ? "Press Tab to scope search"
                  : query
                    ? `for “${query}”`
                    : undefined
            }
            icon={websiteIcon(site.domains)}
            accessories={[
              {
                tag: {
                  value: site.keywords[0] ?? site.name,
                  color: brandColor(site.id, site.domains, site.color),
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
                  onAction={() =>
                    tabBang ? enterBangScope(tabBang) : enterSiteSearch(site)
                  }
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
                {exactSearchAction()}
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
            onScope={(site) =>
              tabBang ? enterBangScope(tabBang) : enterSiteSearch(site)
            }
            scopeTrigger={tabBang?.trigger}
            searchAction={exactSearchAction()}
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
                {tabScopeAction()}
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
                {exactSearchAction()}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    );
  }

  const navigationTitle =
    scopedBang?.trigger ?? scopedSite?.name ?? browser?.name ?? "Omnibar";

  return (
    <List
      isLoading={isLoading}
      navigationTitle={navigationTitle}
      searchBarPlaceholder={placeholder}
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      filtering={false}
      selectedItemId={selectedItemId}
      onSelectionChange={(id) => {
        const reported = id ?? undefined;
        const decision = selectionAfterReport({
          pinnedId: selectionPin.current,
          reportedId: reported,
        });
        selectionPin.current = decision.pinnedId;
        if (decision.selectedId !== lastSelection.current) {
          lastSelection.current = decision.selectedId;
          recordAction({ kind: "select", id: decision.selectedId ?? "" });
        }
        setSelectedItemId(decision.selectedId);
      }}
    >
      {spaceOnly ? (
        renderUnscopedSection("space")
      ) : scopedSite || scopedBang ? (
        <>
          {renderQuickSection(
            scopedHistory,
            uniqueLabels(scopedSuggestions),
            (suggestion) => {
              runAndClose(async () => {
                if (!app) return;
                const url = scopedSite
                  ? scopedSite.buildUrl(suggestion)
                  : scopedBang
                    ? buildBangSearchUrl(scopedBang, suggestion)
                    : suggestion;
                await openInBrowser(app, url);
              });
            },
            websiteIcon(scopedBang?.domains ?? scopedSite?.domains),
          )}
          {scopedBang?.kind === "ask" && (
            <List.Section title="@Ask">
              <List.Item
                id={SCOPED_SEARCH_ITEM_ID}
                title={
                  searchText.trim()
                    ? `Ask “${searchText.trim()}”`
                    : "Type a question…"
                }
                subtitle={askLoading ? "Thinking…" : (askAnswer ?? undefined)}
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
                    {exactSearchAction()}
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
                icon={websiteIcon(scopedBang.domains)}
                accessories={[
                  {
                    tag: {
                      value: scopedBang.trigger,
                      color: brandColor(scopedBang.id, scopedBang.domains),
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
                            buildBangSearchUrl(scopedBang, searchText.trim()),
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
                    {exactSearchAction()}
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {scopedBang && scopedBang.kind === "site" && !searchText.trim() && (
            <List.Section title={scopedBang.trigger}>
              <List.Item
                id={SCOPED_SEARCH_ITEM_ID}
                title={scopedBang.trigger}
                subtitle="Type a query, or press ⌫ to exit"
                icon={websiteIcon(scopedBang.domains)}
                accessories={[
                  {
                    tag: {
                      value: scopedBang.trigger,
                      color: brandColor(scopedBang.id, scopedBang.domains),
                    },
                  },
                ]}
                actions={
                  <ActionPanel>
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
                    {exactSearchAction()}
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
                icon={websiteIcon(scopedSite.domains)}
                accessories={[
                  {
                    tag: {
                      value: scopedSite.name,
                      color: brandColor(
                        scopedSite.id,
                        scopedSite.domains,
                        scopedSite.color,
                      ),
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
                    {exactSearchAction()}
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
                icon={websiteIcon(scopedSite.domains)}
                accessories={[
                  {
                    tag: {
                      value: scopedSite.name,
                      color: brandColor(
                        scopedSite.id,
                        scopedSite.domains,
                        scopedSite.color,
                      ),
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
                    {exactSearchAction()}
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {listAfterQuick(scopedHistory).length > 0 && app && (
            <List.Section
              title={searchText.trim() ? "History" : "Recent"}
              subtitle={`${listAfterQuick(scopedHistory).length}`}
            >
              {listAfterQuick(scopedHistory).map((item) => (
                <HistoryListItem
                  key={historyItemId(item.url)}
                  item={item}
                  icon={websiteIcon(scopedBang?.domains ?? scopedSite?.domains)}
                  tag={{
                    value: scopedBang?.trigger ?? scopedSite?.name ?? "History",
                    color: scopedBang
                      ? brandColor(scopedBang.id, scopedBang.domains)
                      : scopedSite
                        ? brandColor(
                            scopedSite.id,
                            scopedSite.domains,
                            scopedSite.color,
                          )
                        : Color.SecondaryText,
                  }}
                  onOpen={() =>
                    runAndClose(async () => {
                      await openInBrowser(app, item.url);
                    })
                  }
                  tabAction={tabScopeAction()}
                  trailingActions={closeAction()}
                  searchAction={exactSearchAction()}
                />
              ))}
            </List.Section>
          )}
          {domainScope &&
            domainScope.length > 0 &&
            filteredBookmarks.length > 0 &&
            app && (
              <List.Section
                title="Bookmarks"
                subtitle={`${filteredBookmarks.length}`}
              >
                {filteredBookmarks.map((item) => (
                  <List.Item
                    key={`bm-${item.id}`}
                    id={`bm-${item.id}`}
                    title={item.title}
                    subtitle={item.folderPath || item.domain}
                    icon={websiteIcon(domainScope)}
                    accessories={[
                      {
                        tag: {
                          value:
                            scopedBang?.trigger ??
                            scopedSite?.name ??
                            "Bookmark",
                          color: scopedBang
                            ? brandColor(scopedBang.id, scopedBang.domains)
                            : scopedSite
                              ? brandColor(
                                  scopedSite.id,
                                  scopedSite.domains,
                                  scopedSite.color,
                                )
                              : Color.SecondaryText,
                        },
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
                        {closeAction()}
                        {exactSearchAction()}
                      </ActionPanel>
                    }
                  />
                ))}
              </List.Section>
            )}
          {listAfterQuick(uniqueLabels(scopedSuggestions)).length > 0 &&
            (scopedSite || scopedBang) && (
              <List.Section title="Suggestions">
                {listAfterQuick(uniqueLabels(scopedSuggestions)).map(
                  (suggestion) => {
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
                        icon={websiteIcon(
                          scopedBang?.domains ?? scopedSite?.domains,
                        )}
                        accessories={[
                          {
                            tag: {
                              value: scopeName,
                              color: scopedBang
                                ? brandColor(scopedBang.id, scopedBang.domains)
                                : scopedSite
                                  ? brandColor(
                                      scopedSite.id,
                                      scopedSite.domains,
                                      scopedSite.color,
                                    )
                                  : Color.SecondaryText,
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
                            {exactSearchAction()}
                          </ActionPanel>
                        }
                      />
                    );
                  },
                )}
              </List.Section>
            )}
        </>
      ) : (
        <>
          {sectionsForQuery(searchText).map((section) =>
            renderUnscopedSection(section),
          )}

          {listAfterQuick(uniqueLabels(globalSuggestions)).length > 0 &&
            app && (
              <List.Section title="Suggestions">
                {listAfterQuick(uniqueLabels(globalSuggestions))
                  .slice(0, 5)
                  .map((suggestion) => (
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
                          {tabBang
                            ? tabScopeAction()
                            : jumpTargetId && (
                                <JumpToAction onJump={jumpToAction} />
                              )}
                          {exactSearchAction()}
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

function TabToBang(props: { bang: Bang; onComplete: (bang: Bang) => void }) {
  return (
    <Action
      title={`Scope ${props.bang.trigger}`}
      icon={Icon.ArrowRight}
      shortcut={{ modifiers: [], key: "tab" }}
      onAction={() => props.onComplete(props.bang)}
    />
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
  onJumpToAction?: () => void;
  tabAction?: ReactNode;
  searchAction?: ReactNode;
  trailingActions?: ReactNode;
  icon?: List.Item.Props["icon"];
  tag?: { value: string; color: Color.ColorLike };
  id?: string;
}) {
  const {
    item,
    onOpen,
    onJumpToAction,
    tabAction,
    searchAction,
    trailingActions,
    icon,
    tag,
    id,
  } = props;
  const logo = historyLinkLogo(item.domain);
  return (
    <List.Item
      id={id ?? historyItemId(item.url)}
      title={item.title}
      subtitle={item.domain}
      icon={icon ?? Icon.Clock}
      accessories={[
        ...(logo ? [{ icon: logo, tooltip: item.domain }] : []),
        {
          tag: tag ?? { value: "History", color: Color.SecondaryText },
        },
      ]}
      actions={
        <ActionPanel>
          <Action title="Open" icon={Icon.Globe} onAction={onOpen} />
          {searchAction}
          {tabAction}
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
  scopeTrigger?: string;
  searchAction?: ReactNode;
}) {
  const {
    tab,
    engines,
    keywordEngine,
    onJump,
    onScope,
    scopeTrigger,
    searchAction,
  } = props;
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
          {searchAction}
          <Action
            title={
              scopeTrigger
                ? `Scope ${scopeTrigger}`
                : `Search ${keywordEngine?.name ?? tabSite.name}`
            }
            icon={scopeTrigger ? Icon.ArrowRight : Icon.MagnifyingGlass}
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
