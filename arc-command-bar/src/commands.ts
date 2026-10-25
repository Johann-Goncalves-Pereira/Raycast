export type CommandCategory =
  | "navigation"
  | "organization"
  | "tools"
  | "other"
  | "settings";

export type BrowserCommand = {
  id: string;
  title: string;
  keywords: string[];
  category: CommandCategory;
  shortcut?: string;
  /** When set, open this URL in the frontmost browser instead of AppleScript. */
  openUrl?: string;
};

export const SUGGESTED_COMMAND_IDS = [
  "reload",
  "copy-current-url",
  "new-window",
  "close-tab",
  "downloads",
  "view-history",
  "preferences",
] as const;

export const COMMAND_CATALOG: BrowserCommand[] = [
  {
    id: "new-window",
    title: "New Window",
    keywords: ["window", "new"],
    category: "navigation",
    shortcut: "⌘N",
  },
  {
    id: "new-incognito",
    title: "New Incognito Window",
    keywords: ["incognito", "private", "window"],
    category: "navigation",
    shortcut: "⌘⇧N",
  },
  {
    id: "reopen-closed-tab",
    title: "Reopen Last Closed Tab",
    keywords: ["reopen", "undo close", "restore tab"],
    category: "navigation",
    shortcut: "⌘⇧T",
  },
  {
    id: "copy-current-url",
    title: "Copy Current URL",
    keywords: ["supercopy", "copy url", "clipboard"],
    category: "navigation",
    shortcut: "⌘⇧C",
  },
  {
    id: "copy-url-markdown",
    title: "Copy URL as Markdown",
    keywords: ["markdown", "copy link", "supercopy"],
    category: "navigation",
    shortcut: "⌘⇧⌥C",
  },
  {
    id: "copy-urls",
    title: "Copy URLs",
    keywords: ["copy all", "tabs", "batch"],
    category: "organization",
  },
  {
    id: "go-back",
    title: "Go Back in History",
    keywords: ["back", "history"],
    category: "navigation",
    shortcut: "⌘[",
  },
  {
    id: "go-forward",
    title: "Go Forward in History",
    keywords: ["forward", "history"],
    category: "navigation",
    shortcut: "⌘]",
  },
  {
    id: "downloads",
    title: "Downloads",
    keywords: ["download"],
    category: "navigation",
    shortcut: "⌘⇧J",
    openUrl: "chrome://downloads/",
  },
  {
    id: "close-tab",
    title: "Close Tab",
    keywords: ["close", "tab"],
    category: "navigation",
    shortcut: "⌘W",
  },
  {
    id: "minimize-window",
    title: "Minimize Window",
    keywords: ["minimize"],
    category: "navigation",
    shortcut: "⌘M",
  },
  {
    id: "close-window",
    title: "Close Window",
    keywords: ["close window"],
    category: "navigation",
    shortcut: "⌘⇧W",
  },
  {
    id: "quit-browser",
    title: "Quit Browser",
    keywords: ["quit", "exit"],
    category: "navigation",
    shortcut: "⌘Q",
  },
  {
    id: "find-in-page",
    title: "Find…",
    keywords: ["find", "search page"],
    category: "navigation",
    shortcut: "⌘F",
  },
  {
    id: "duplicate-tab",
    title: "Duplicate Current Tab",
    keywords: ["duplicate", "clone"],
    category: "organization",
  },
  {
    id: "new-google-doc",
    title: "New Google Doc",
    keywords: ["docs", "google", "document"],
    category: "tools",
    openUrl: "https://docs.new",
  },
  {
    id: "new-google-sheet",
    title: "New Google Sheet",
    keywords: ["sheets", "spreadsheet", "google"],
    category: "tools",
    openUrl: "https://sheets.new",
  },
  {
    id: "new-google-meet",
    title: "New Google Meet",
    keywords: ["meet", "call", "video"],
    category: "tools",
    openUrl: "https://meet.new",
  },
  {
    id: "new-notion-page",
    title: "New Notion Page",
    keywords: ["notion"],
    category: "tools",
    openUrl: "https://notion.new",
  },
  {
    id: "new-figma",
    title: "New Figma Document",
    keywords: ["figma", "design"],
    category: "tools",
    openUrl: "https://www.figma.com/new",
  },
  {
    id: "new-figjam",
    title: "New FigJam",
    keywords: ["figjam", "whiteboard"],
    category: "tools",
    openUrl: "https://www.figma.com/figjam/new",
  },
  {
    id: "new-linear-issue",
    title: "New Linear Issue",
    keywords: ["linear", "issue"],
    category: "tools",
    openUrl: "https://linear.app/new",
  },
  {
    id: "new-repl",
    title: "New Repl",
    keywords: ["replit", "repl"],
    category: "tools",
    openUrl: "https://replit.com/new",
  },
  {
    id: "reload",
    title: "Reload Page",
    keywords: ["refresh", "reload"],
    category: "other",
    shortcut: "⌘R",
  },
  {
    id: "zoom-in",
    title: "Zoom In",
    keywords: ["zoom"],
    category: "other",
    shortcut: "⌘+",
  },
  {
    id: "zoom-out",
    title: "Zoom Out",
    keywords: ["zoom"],
    category: "other",
    shortcut: "⌘-",
  },
  {
    id: "zoom-actual",
    title: "Zoom to Actual Size",
    keywords: ["zoom", "reset", "100%"],
    category: "other",
    shortcut: "⌘0",
  },
  {
    id: "developer-tools",
    title: "Developer Tools",
    keywords: ["devtools", "inspect", "console"],
    category: "other",
    shortcut: "⌘⌥I",
  },
  {
    id: "full-screen",
    title: "Enter Full Screen",
    keywords: ["fullscreen"],
    category: "other",
    shortcut: "⌃⌘F",
  },
  {
    id: "view-history",
    title: "View History",
    keywords: ["history"],
    category: "other",
    shortcut: "⌘Y",
    openUrl: "chrome://history/",
  },
  {
    id: "print",
    title: "Print…",
    keywords: ["print"],
    category: "other",
    shortcut: "⌘P",
  },
  {
    id: "save-page",
    title: "Save Page As…",
    keywords: ["save", "download page"],
    category: "other",
    shortcut: "⌘S",
  },
  {
    id: "undo",
    title: "Undo",
    keywords: ["undo"],
    category: "other",
    shortcut: "⌘Z",
  },
  {
    id: "redo",
    title: "Redo",
    keywords: ["redo"],
    category: "other",
    shortcut: "⌘⇧Z",
  },
  {
    id: "preferences",
    title: "Preferences…",
    keywords: ["settings", "prefs"],
    category: "settings",
    shortcut: "⌘,",
    openUrl: "chrome://settings/",
  },
  {
    id: "manage-extensions",
    title: "Manage Extensions…",
    keywords: ["extensions", "plugins"],
    category: "settings",
    openUrl: "chrome://extensions/",
  },
  {
    id: "add-extension",
    title: "Add Extension…",
    keywords: ["web store", "chrome store"],
    category: "settings",
    openUrl: "https://chromewebstore.google.com/",
  },
];

export function findCommand(id: string): BrowserCommand | undefined {
  return COMMAND_CATALOG.find((c) => c.id === id);
}

function scoreCommand(command: BrowserCommand, query: string): number {
  const q = query.toLowerCase();
  const title = command.title.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  for (const keyword of command.keywords) {
    const k = keyword.toLowerCase();
    if (k === q) return 70;
    if (k.startsWith(q) || k.includes(q)) return 50;
    if (q.includes(k)) return 40;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  if (
    tokens.length > 1 &&
    tokens.every(
      (t) =>
        title.includes(t) ||
        command.keywords.some((k) => k.toLowerCase().includes(t)),
    )
  ) {
    return 55;
  }
  return 0;
}

/** Empty filter → curated suggestions; otherwise ranked keyword/title matches. */
export function filterCommands(query: string, limit = 10): BrowserCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return SUGGESTED_COMMAND_IDS.map((id) => findCommand(id)).filter(
      (c): c is BrowserCommand => Boolean(c),
    );
  }

  return COMMAND_CATALOG.map((command) => ({
    command,
    score: scoreCommand(command, q),
  }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.command.title.localeCompare(b.command.title),
    )
    .slice(0, limit)
    .map((row) => row.command);
}
