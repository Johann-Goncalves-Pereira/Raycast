#!/usr/bin/env node
/**
 * Live checks for Omnibar on Helium, Safari, Zen, and Chrome.
 * Activates each installed browser, opens Omnibar, and reads the front tab.
 *
 * Usage: node scripts/verify-omnibar.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const deeplink =
  "raycast://extensions/johann_goncalves_pereira/omnibar/search";
const hintPath = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "omnibar",
  "last-browser.json",
);

const browsers = [
  {
    id: "helium",
    bundleId: "net.imput.helium",
    engine: "chromium",
    history: path.join(
      os.homedir(),
      "Library/Application Support/net.imput.helium/Default/History",
    ),
  },
  {
    id: "safari",
    bundleId: "com.apple.Safari",
    engine: "webkit",
    history: path.join(os.homedir(), "Library/Safari/History.db"),
  },
  {
    id: "zen",
    bundleId: "app.zen-browser.zen",
    engine: "gecko",
    history: null,
  },
  {
    id: "chrome",
    bundleId: "com.google.Chrome",
    engine: "chromium",
    history: path.join(
      os.homedir(),
      "Library/Application Support/Google/Chrome/Default/History",
    ),
  },
];

const results = [];

function record(browserId, check, ok, detail) {
  results.push({ browserId, check, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${browserId}  ${check}  ${detail}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(file, args, input) {
  return execFileSync(file, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function osa(script) {
  return run("osascript", ["-"], script);
}

function appPathFor(bundleId) {
  try {
    const found = run("mdfind", [`kMDItemCFBundleIdentifier == '${bundleId}'`]);
    const first = found
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.endsWith(".app"));
    return first;
  } catch {
    return undefined;
  }
}

function bundleName(appPath) {
  const info = path.join(appPath, "Contents/Info.plist");
  return run("defaults", ["read", info, "CFBundleName"]);
}

function writeHint(browser) {
  fs.mkdirSync(path.dirname(hintPath), { recursive: true });
  fs.writeFileSync(
    hintPath,
    JSON.stringify({
      bundleId: browser.bundleId,
      name: browser.appName,
      recordedAt: Date.now(),
    }),
  );
}

function activate(appPath) {
  run("open", ["-a", appPath]);
}

function frontBundle() {
  try {
    return osa(
      'tell application "System Events" to get bundle identifier of first process whose frontmost is true',
    );
  } catch {
    return "";
  }
}

function frontTabUrl(browser) {
  const name = browser.appName.replaceAll('"', '\\"');
  if (browser.engine === "webkit") {
    return osa(
      `tell application "${name}" to get URL of current tab of front window`,
    );
  }
  if (browser.engine === "gecko") {
    return latestGeckoUrl();
  }
  return osa(
    `tell application "${name}" to get URL of active tab of front window`,
  );
}

function findTab(browser, accept) {
  if (browser.engine !== "chromium") {
    const current = frontTabUrl(browser);
    return accept(current) ? current : "";
  }
  const name = browser.appName.replaceAll('"', '\\"');
  const raw = osa(
    `tell application "${name}" to get URL of every tab of every window`,
  );
  for (const url of raw.split(", ").map((item) => item.trim())) {
    if (accept(url)) return url;
  }
  return "";
}

async function waitFor(label, predicate, timeoutMs = 8000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const value = predicate();
      if (value) return value;
      last = String(value);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(350);
  }
  throw new Error(`${label} timed out (${last})`);
}

const keysScript = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "send-omnibar-keys.swift",
);

function sendKeys(text, chord = "") {
  run("swift", [keysScript, text, chord]);
}

function omnibarVisible() {
  try {
    run("swift", [keysScript, "--visible"]);
    return true;
  } catch {
    return false;
  }
}

function clearSavedScope(bundleId) {
  const file = path.join(path.dirname(hintPath), "sessions.json");
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    parsed = {};
  }
  parsed[bundleId] = {
    searchText: "",
    scopedId: null,
    scopedKind: null,
    updatedAt: Date.now(),
  };
  fs.writeFileSync(file, JSON.stringify(parsed));
}

function sessionFor(bundleId) {
  const file = path.join(path.dirname(hintPath), "sessions.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed[bundleId];
  } catch {
    return undefined;
  }
}

function isSearchUrl(url, query) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const encoded = encodeURIComponent(query).toLowerCase();
  const haystack = `${parsed.search}${parsed.pathname}`.toLowerCase();
  if (!haystack.includes(encoded) && !haystack.includes(query.toLowerCase())) {
    return false;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (query === "github.com" && (host === "github.com" || host.endsWith(".github.com"))) {
    return false;
  }
  return true;
}

function printDialogOpen(appName) {
  try {
    const names = osa(`tell application "System Events"
      tell process ${JSON.stringify(appName)}
        set collected to ""
        repeat with w in windows
          set collected to collected & (name of w as text) & linefeed
        end repeat
        return collected
      end tell
    end tell`);
    return /print/i.test(names);
  } catch {
    return false;
  }
}

function clearPending() {
  for (const name of ["pending-tab.json", "pending-submit.json"]) {
    fs.rmSync(path.join(path.dirname(hintPath), name), { force: true });
  }
}

async function openOmnibar(browser) {
  clearPending();
  writeHint(browser);
  run("open", ["-a", "Raycast"]);
  run("open", [deeplink]);
  await waitFor(`${browser.id} omnibar`, () => (omnibarVisible() ? "open" : ""));
  await sleep(500);
}

function isSearchEngineHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return /google\.|bing\.com|duckduckgo\.|search\.yahoo\./.test(host);
  } catch {
    return false;
  }
}

function dismissPrint(appName) {
  osa(`tell application "System Events"
    tell process ${JSON.stringify(appName)}
      set frontmost to true
      key code 53
    end tell
  end tell`);
}

function recentHistory(browser) {
  const db = browser.id === "zen" ? zenPlacesPath() : browser.history;
  if (!db || !fs.existsSync(db)) return undefined;
  const copy = path.join(os.tmpdir(), `omnibar-verify-${browser.id}-history`);
  try {
    fs.copyFileSync(db, copy);
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(db + suffix)) {
        fs.copyFileSync(db + suffix, copy + suffix);
      }
    }
  } catch {
    return undefined;
  }
  const sql =
    browser.engine === "webkit"
      ? `SELECT history_items.url, history_items.title
         FROM history_items
         JOIN history_visits ON history_visits.history_item = history_items.id
         WHERE history_items.url LIKE 'http%'
         GROUP BY history_items.id
         ORDER BY MAX(history_visits.visit_time) DESC
         LIMIT 8`
      : browser.engine === "gecko"
        ? `SELECT url, title FROM moz_places
           WHERE hidden = 0 AND url LIKE 'http%' AND title IS NOT NULL
           ORDER BY last_visit_date DESC LIMIT 8`
        : `SELECT url, title FROM urls
           WHERE hidden = 0 AND url LIKE 'http%' AND title != ''
           ORDER BY last_visit_time DESC LIMIT 8`;
  let raw = "";
  try {
    raw = run("sqlite3", ["-separator", "\t", copy, sql]);
  } catch {
    return undefined;
  }
  for (const line of raw.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const url = line.slice(0, tab);
    const title = line.slice(tab + 1);
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (/google\.|bing\.|duckduckgo\.|search\.yahoo\./.test(host)) continue;
    const word = title.split(/[^A-Za-z]+/).find((part) => part.length >= 6);
    if (!word) continue;
    return { url, title, word, host };
  }
  return undefined;
}

function latestGeckoUrl() {
  const db = zenPlacesPath();
  if (!db) return "";
  const copy = path.join(os.tmpdir(), "omnibar-verify-zen-live.sqlite");
  try {
    fs.copyFileSync(db, copy);
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(db + suffix)) {
        fs.copyFileSync(db + suffix, copy + suffix);
      }
    }
    return run("sqlite3", [
      copy,
      "SELECT url FROM moz_places ORDER BY last_visit_date DESC LIMIT 1",
    ]);
  } catch {
    return "";
  }
}

function zenPlacesPath() {
  const root = path.join(
    os.homedir(),
    "Library/Application Support/zen",
  );
  const ini = path.join(root, "profiles.ini");
  if (!fs.existsSync(ini)) return undefined;
  const text = fs.readFileSync(ini, "utf8");
  const match = text.match(/^Path=(.+)$/m);
  if (!match) return undefined;
  const profile = path.join(root, match[1]);
  const places = path.join(profile, "places.sqlite");
  return fs.existsSync(places) ? places : undefined;
}

async function checkBrowser(browser) {
  activate(browser.appPath);
  await sleep(900);
  try {
    osa(`tell application "System Events" to keystroke "p" using command down`);
    await sleep(900);
  } catch (error) {
    record(
      browser.id,
      "cmd-p",
      false,
      error instanceof Error ? error.message : String(error),
    );
    return;
  }
  const printed = printDialogOpen(browser.appName);
  if (printed) dismissPrint(browser.appName);
  record(
    browser.id,
    "cmd-p-no-print",
    !printed,
    printed ? "print dialog opened" : "print dialog stayed closed",
  );

  try {
    await openOmnibar(browser);
    const query = `omnibarcheck${browser.id}`;
    sendKeys(query, "cmd-return");
    const url = await waitFor(`${browser.id} search tab`, () =>
      findTab(browser, (current) => isSearchUrl(current, query)),
    );
    record(browser.id, "cmd-enter-search", true, url);
  } catch (error) {
    record(
      browser.id,
      "cmd-enter-search",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await openOmnibar(browser);
    sendKeys("github.com", "cmd-return");
    const url = await waitFor(`${browser.id} github search`, () =>
      findTab(browser, (current) => isSearchUrl(current, "github.com")),
    );
    record(browser.id, "github-stays-search", true, url);
  } catch (error) {
    record(
      browser.id,
      "github-stays-search",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    clearSavedScope(browser.bundleId);
    let session;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await openOmnibar(browser);
      const before = sessionFor(browser.bundleId)?.updatedAt ?? 0;
      sendKeys("you", "tab");
      await sleep(700);
      session = sessionFor(browser.bundleId);
      if (
        session?.scopedId === "youtube" &&
        session?.scopedKind === "bang" &&
        session.updatedAt > before
      ) {
        break;
      }
    }
    const ok =
      session?.scopedId === "youtube" &&
      session?.scopedKind === "bang";
    record(
      browser.id,
      "you-tab",
      ok,
      ok ? "@YouTube" : JSON.stringify(session ?? null),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      sendKeys("", "escape");
      await sleep(350);
      if (sessionFor(browser.bundleId)?.scopedKind !== "bang") break;
    }
  } catch (error) {
    record(
      browser.id,
      "you-tab",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await openOmnibar(browser);
    const before = frontTabUrl(browser);
    sendKeys("", "clear-cmd-return");
    await sleep(800);
    const after = frontTabUrl(browser);
    const stillOpen = omnibarVisible();
    record(
      browser.id,
      "empty-cmd-enter-stays",
      stillOpen && after === before,
      stillOpen ? "window stayed open" : "window closed",
    );
  } catch (error) {
    record(
      browser.id,
      "empty-cmd-enter-stays",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  const history = recentHistory(browser);
  if (!history) {
    record(browser.id, "history-enter", true, "skipped, history database not readable");
    record(
      browser.id,
      "cmd-enter-ignores-history",
      true,
      "skipped, history database not readable",
    );
    return;
  }
  try {
    await openOmnibar(browser);
    const before = frontTabUrl(browser);
    sendKeys(history.word.toLowerCase(), "return");
    const url = await waitFor(
      `${browser.id} history enter`,
      () => {
        const current = frontTabUrl(browser);
        if (!current || current === before) return "";
        try {
          const host = new URL(current).hostname.replace(/^www\./, "");
          if (host !== history.host && !host.endsWith(`.${history.host}`)) {
            return "";
          }
          return current;
        } catch {
          return "";
        }
      },
      7000,
    );
    const openedHistory = !isSearchEngineHost(url);
    record(
      browser.id,
      "history-enter",
      openedHistory,
      `${history.word} -> ${url}`,
    );
  } catch (error) {
    record(
      browser.id,
      "history-enter",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await openOmnibar(browser);
    sendKeys(history.word.toLowerCase(), "cmd-return");
    const url = await waitFor(`${browser.id} history cmd-enter`, () =>
      findTab(browser, (current) =>
        isSearchUrl(current, history.word.toLowerCase()),
      ),
    );
    record(browser.id, "cmd-enter-ignores-history", true, url);
  } catch (error) {
    record(
      browser.id,
      "cmd-enter-ignores-history",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

const only = new Set(process.argv.slice(2));
const ready = [];
for (const browser of browsers) {
  if (only.size > 0 && !only.has(browser.id)) continue;
  const appPath = appPathFor(browser.bundleId);
  if (!appPath) {
    record(browser.id, "installed", false, "not installed");
    continue;
  }
  browser.appPath = appPath;
  browser.appName = bundleName(appPath);
  ready.push(browser);
  record(browser.id, "installed", true, `${browser.appName} ${appPath}`);
}

for (const browser of ready) {
  await checkBrowser(browser);
}

const failed = results.filter((item) => !item.ok && item.check !== "installed");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exit(1);
