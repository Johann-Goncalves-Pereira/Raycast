import { commandsForToken, toCommandParams } from "./key-command.js";
import { findLockedTabId } from "./tab-match.js";

const bridge = "http://127.0.0.1:8765";
const debuggerVersion = "1.3";

let attachedTabId: number | null = null;

interface SessionBody {
  url?: string;
}

interface CharsBody {
  chars?: string[];
}

async function readSession(): Promise<string> {
  const response = await fetch(`${bridge}/session`);
  if (!response.ok) {
    return "";
  }
  const body = (await response.json()) as SessionBody;
  return typeof body.url === "string" ? body.url : "";
}

async function readChars(): Promise<string[]> {
  const response = await fetch(`${bridge}/chars`);
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as CharsBody;
  if (!Array.isArray(body.chars)) {
    return [];
  }
  return body.chars.filter(
    (token): token is string => typeof token === "string",
  );
}

async function detach(): Promise<void> {
  if (attachedTabId === null) {
    return;
  }
  const tabId = attachedTabId;
  attachedTabId = null;
  await chrome.debugger.detach({ tabId }).catch(() => undefined);
}

async function attach(tabId: number): Promise<void> {
  if (attachedTabId === tabId) {
    return;
  }
  await detach();
  await chrome.debugger.attach({ tabId }, debuggerVersion);
  attachedTabId = tabId;
}

async function typeInto(
  tabId: number,
  tokens: readonly string[],
): Promise<void> {
  for (const token of tokens) {
    for (const command of commandsForToken(token)) {
      await chrome.debugger.sendCommand(
        { tabId },
        "Input.dispatchKeyEvent",
        toCommandParams(command),
      );
    }
  }
}

async function tick(): Promise<void> {
  await fetch(`${bridge}/hello`, { method: "POST" }).catch(() => undefined);
  const url = await readSession().catch(() => "");
  if (url.length === 0) {
    await detach();
    return;
  }
  const tabs = await chrome.tabs.query({});
  const tabId = findLockedTabId(tabs, url);
  if (tabId === null) {
    await detach();
    return;
  }
  await attach(tabId);
  const chars = await readChars();
  if (chars.length > 0 && attachedTabId === tabId) {
    await typeInto(tabId, chars);
  }
}

void tick();
setInterval(() => {
  void tick();
}, 40);
