# Browser Spotlight — Arc-style Cmd+P for browsers

Local Raycast extension. When a Chromium/WebKit browser is frontmost, **⌘P** opens an Arc-like command bar: jump to open tabs, search the web, site-scoped search, and (Chromium) extensions.

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
- **Excluded browsers** — checkboxes; excluded apps keep native ⌘P (Print). Run **Apply Browser Exclusions** after changing them.

## Scope

Supported: Chrome, Safari, Arc, Helium, Brave, Edge, Vivaldi, Opera, Orion, Chromium (+ Canary/Dev/STP/Dia).  
Not supported: Zen / Firefox (no AppleScript tab API on macOS).
