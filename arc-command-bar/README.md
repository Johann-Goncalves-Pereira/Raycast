# Browser Spotlight — Arc-style Cmd+P for browsers

Local Raycast extension. When a Chromium/WebKit browser is frontmost, **⌘P** opens an Arc-like command bar: **Switch to Tab** first, MRU zero-state, history, bookmarks, web/site search, portable browser commands, Supercopy, and inline math — without Arc-only shell features (Spaces, Little Arc, Split, Easels).

## Setup

1. In Raycast: **Import Extension** → choose `browser-spotlight/`
2. Or from this folder: `npm install && npm run dev`
3. Apply / repair the Karabiner Cmd+P binding:

```bash
npm run apply-karabiner   # write the rule into ~/.config/karabiner/karabiner.json
npm run fix-karabiner     # diagnose daemons, open permission panes, re-apply rule
```

   Or from Raycast: run **Apply Browser Exclusions**

4. If the extension still shows the old purple icon in Raycast, run:

```bash
npm run refresh-icon
```

Then in Raycast: **Browser Spotlight → Actions (⌘K) → Development → Clear Local Assets Cache**

5. Grant **Automation** access for Raycast → each browser (System Settings → Privacy & Security → Automation)

Karabiner rule description: `Cmd+P → Browser Spotlight when browser frontmost`  
Deeplink: `raycast://extensions/johann_goncalves_pereira/browser-spotlight/search`

## If ⌘P still opens a new tab (Karabiner not running)

The JSON rule alone does nothing until Karabiner’s services **and Driver Extension** are working. Symptoms: Helium/Chrome keep native ⌘P.

### What your screenshot already shows

**Allow in the Background** is already ON for Karabiner (Privileged Daemons / Agents). That part is fine.

The missing piece in Karabiner → Diagnostic → Setup is **Driver Extension** (empty circle). That is **not** the same as “Allow in the Background”.

### Where Driver Extensions actually is (easy to miss)

1. **System Settings → General → Login Items & Extensions**
2. Scroll past “Allow in the Background” to the **Extensions** area
3. Find **Driver Extensions** (separate row) → click the **(i)** info button on the right  
   (Karabiner’s own Setup screen draws a red arrow at this)
4. Enable **`.Karabiner-VirtualHIDDevice-Manager`**

If that row is missing: in Karabiner Setup use **Deactivate driver** → **restart Mac** → after reboot the toggle should appear, then enable it.

### Repair scripts

```bash
npm run fix-karabiner
npm run reinstall-karabiner   # only if privileged install missing
```

### Recommended: browser Cmd+P without the Driver Extension

If you cannot enable Driver Extensions (common on macOS 26), use the Accessibility event-tap hotkey instead — same browser-only ⌘P behavior, **no Karabiner driver**:

```bash
npm run install-cmd-p-hotkey
```

Then authorize the **.app** (not the old bare binary):

1. **Privacy & Security → Accessibility** → remove old `browser-cmd-p-hotkey` if listed → add  
   `~/Library/Application Support/browser-spotlight/Browser Spotlight Cmd+P.app` → ON
2. **Privacy & Security → Input Monitoring** → add the same app → ON  
   (often required on macOS 26 even when Accessibility is already on)
3. Focus Helium → ⌘P

Check logs if it still fails:

```bash
tail -f ~/Library/Application\ Support/browser-spotlight/cmd-p-hotkey.err.log
```

You want a line: `Browser Spotlight Cmd+P hotkey running`

### Interim Raycast global hotkey

While fixing permissions, you can also bind a Raycast hotkey (**⌘⇧P**) on **Browser Spotlight** via Configure Command. That is global (not browser-only).

## Preferences

- Search engine + typeahead suggestions
- **Excluded browsers** — checkboxes; excluded apps keep native ⌘P (Print). **Arc is never remapped** (it has its own command bar). Run **Apply Browser Exclusions** after changing them.

Tabs, history, bookmarks, site engines, and extensions use **stale-while-revalidate**: reopen paints the last cache immediately, then refreshes in the background. Typing uses an ~80ms filter debounce; suggestions stay at 200ms.

## Command bar UX (Arc research)

| Behavior | How |
| --- | --- |
| Empty state | **5 MRU open tabs**, suggested commands, recent history, bookmarks |
| Switch to Tab | Matching open tabs rank/select **first** (Enter jumps; no duplicate) |
| `/ ` prefix | Slash + space → **commands only** (tabs/history/web hidden) |
| Site search | Keyword → **Tab** → red pill scope (unchanged) |
| Supercopy | Copy URL strips `utm_*`, `fbclid`, `gclid`, …; Markdown copy available |
| Inline answers | Math / temp / currency → **Enter copies** and dismisses |
| SaaS | `New Google Doc`, Sheets, Meet, Notion, Figma, Linear, Repl |

### Commands (portable subset)

Navigation: New Window, Incognito, Reopen Closed Tab, Copy Current URL / Markdown / URLs, Back/Forward, Downloads, Close Tab, Minimize/Close Window, Quit, Find…  
Other: Reload, Zoom In/Out/Actual, DevTools, Full Screen, History, Print, Save, Undo/Redo  
Settings: Preferences, Manage Extensions, Add Extension  

**Out of scope:** Spaces, Little Arc, Easel/Notes/Library/Capture, Split View, pin/reset Space, Clear Today, Archive, Instant Links (⇧Enter), ChatGPT-in-bar.

## Site search (Chrome / Arc style)

When a Chromium-based browser is frontmost, Browser Spotlight reads your **active site-search shortcuts** and built-in search engines from that browser’s profile (`Web Data` → `keywords` table). This is the same list you manage in the browser under **Settings → Search engines and site search**.

### History & bookmarks

Chromium profiles also expose **history** (`History` → `urls`) and **bookmarks** (`Bookmarks` JSON). Matching **open tabs** select first; otherwise the clean search row (or an inline answer) is selected — history never steals focus. **Tab** jumps to the first site/tab/extension/command action. Site-scoped search filters history to that engine’s domains. Safari / Orion do not load history or bookmarks yet.

### How to use

1. Open Browser Spotlight (**⌘P** when a supported browser is focused).
2. Empty bar → pick an MRU tab or a suggested command.
3. Type a query → Switch to Tab if open; otherwise search / history / bookmarks / commands.
4. Type `/ ` then a command name (e.g. `/ reload`) for the action filter.
5. Site keyword → **Tab** to scope; **⌫** on empty query exits scoped search.

### What gets loaded

- **Included:** active site-search entries (`is_active = 1`) and built-in/prepopulated engines (Google, Bing, DuckDuckGo, etc.).
- **Excluded:** inactive OpenSearch discoveries (Chrome’s “Inactive shortcuts”), and internal browser shortcuts such as `@bookmarks`, `@history`, and `@tabs`.
- **Safari / Orion:** no Chromium keyword database — a small built-in fallback list (YouTube, GitHub, Google) is used instead.

### Examples (from your browser config)

| You type | Tab scopes to |
| --- | --- |
| `youtube.com` or `you` | YouTube |
| `g` | Gemini (if configured in Arc/Chrome) |
| `amazon` | Amazon |
| `github` | GitHub |

Shortcuts match what you configured — Arc users with `youtube.com` and `g` for Gemini will see those exact triggers.

## Development

```bash
npm install
npm run dev      # run in Raycast
npm run test     # unit tests (URL expansion, keyword matching, Web Data / History parsing)
npm run build
```

## Scope

Supported: Chrome, Safari, Arc, Helium, Brave, Edge, Vivaldi, Opera, Orion, Chromium (+ Canary/Dev/STP/Dia).  
Not supported: Zen / Firefox (no AppleScript tab API on macOS).
