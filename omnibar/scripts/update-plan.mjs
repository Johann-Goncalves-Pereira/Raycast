/**
 * Decide which install steps a normal `npm run update` still needs.
 * A full update passes `full: true` and rebuilds everything.
 * The Raycast development watcher is never left running: a successful
 * live build is what pins Omnibar into the empty root search.
 */

export function shouldRebuildHotkey({ full, sourceMtimeMs, binaryMtimeMs }) {
  if (full) return true;
  if (binaryMtimeMs == null) return true;
  return sourceMtimeMs > binaryMtimeMs;
}

export function shouldReloadAskBridge({
  full,
  healthy,
  plistMatches,
  serverMtimeMs,
  plistMtimeMs,
}) {
  if (full) return true;
  if (!healthy || !plistMatches) return true;
  if (plistMtimeMs == null) return true;
  return serverMtimeMs > plistMtimeMs;
}

/**
 * Raycast pins a node extension into the empty root Development section
 * only while its development build status is success or failure.
 * A stopped build (`unknown`) stays off that bar and can still be launched.
 */
export function pinnedToDevelopmentSection(devStatus) {
  return devStatus === "success" || devStatus === "failure";
}

export function shouldStopDevelopWatcher({ running, plistInstalled }) {
  return running === true || plistInstalled === true;
}

export function shouldPublishBuild({ full, sourceMtimeMs, buildMtimeMs }) {
  if (full) return true;
  if (buildMtimeMs == null) return true;
  return sourceMtimeMs > buildMtimeMs;
}
