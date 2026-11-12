import type { BrowserEngine } from "./browser-catalog";

/** 'GURL' — the Apple Event that opens a URL in one process. */
const GURL_EVENT = 1_196_773_964;
/** '----' — the direct object of that event. */
const GURL_DIRECT_OBJECT = 757_935_405;

/**
 * Opens `url` in the process id from argv. `open -a Zen` cannot do this:
 * two running Zens share a bundle id, and Launch Services picks the one
 * that was launched last.
 */
export const GURL_SCRIPT = `use framework "Foundation"
on run argv
  set targetPid to (item 1 of argv) as integer
  set urlText to item 2 of argv
  set target to current application's NSAppleEventDescriptor's descriptorWithProcessIdentifier:targetPid
  set gurl to ${GURL_EVENT}
  set ae to current application's NSAppleEventDescriptor's alloc()'s initWithEventClass:gurl eventID:gurl targetDescriptor:target returnID:-1 transactionID:0
  set param to current application's NSAppleEventDescriptor's descriptorWithString:urlText
  ae's setParamDescriptor:param forKeyword:${GURL_DIRECT_OBJECT}
  set wait to 5
  set flags to 1
  set err to missing value
  set reply to (ae's sendEventWithOptions:flags |timeout|:wait |error|:err)
  return "sent"
end run`;

export function activateFocusedProcessScript(pid: number): string {
  return `tell application "System Events" to set frontmost of first process whose unix id is ${pid} to true`;
}

/** Only Gecko runs one process per profile. Chrome and Safari stay on Launch Services. */
export function shouldOpenFocusedProcess(
  engine: BrowserEngine | undefined,
  pid: number | undefined,
): pid is number {
  return engine === "gecko" && typeof pid === "number" && pid > 0;
}

let remembered: { bundleId: string; pid: number } | undefined;

/**
 * Remember the Zen that was focused at Cmd+P. A later resolve that omits
 * the pid must not forget it. Switching to another browser does.
 */
export function rememberFocusedProcess(
  bundleId: string | undefined,
  pid: number | undefined,
): void {
  if (!bundleId) return;
  if (pid != null && pid > 0) {
    remembered = { bundleId, pid };
    return;
  }
  if (remembered && remembered.bundleId !== bundleId) {
    remembered = undefined;
  }
}

export function rememberedFocusedPid(
  bundleId: string | undefined,
): number | undefined {
  if (!bundleId || remembered?.bundleId !== bundleId) return undefined;
  return remembered.pid;
}
