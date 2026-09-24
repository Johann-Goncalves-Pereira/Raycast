import { commandsForToken, toCommandParams } from "./key-command.js";
import { findLockedTabId } from "./tab-match.js";
const bridge = "http://127.0.0.1:8765";
const debuggerVersion = "1.3";
let attachedTabId = null;
async function readSession() {
    const response = await fetch(`${bridge}/session`);
    if (!response.ok) {
        return "";
    }
    const body = (await response.json());
    return typeof body.url === "string" ? body.url : "";
}
async function readChars() {
    const response = await fetch(`${bridge}/chars`);
    if (!response.ok) {
        return [];
    }
    const body = (await response.json());
    if (!Array.isArray(body.chars)) {
        return [];
    }
    return body.chars.filter((token) => typeof token === "string");
}
async function detach() {
    if (attachedTabId === null) {
        return;
    }
    const tabId = attachedTabId;
    attachedTabId = null;
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
}
async function attach(tabId) {
    if (attachedTabId === tabId) {
        return;
    }
    await detach();
    await chrome.debugger.attach({ tabId }, debuggerVersion);
    attachedTabId = tabId;
}
async function typeInto(tabId, tokens) {
    for (const token of tokens) {
        for (const command of commandsForToken(token)) {
            await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", toCommandParams(command));
        }
    }
}
async function tick() {
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
