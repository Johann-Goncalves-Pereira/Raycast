#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title ActivityWatch
# @raycast.mode silent
#
# Optional parameters:
# @raycast.icon icon.png
# @raycast.packageName ActivityWatch
#
# Documentation:
# @raycast.description Opens ActivityWatch (launches the app if needed), starts the T3 Code watcher, and opens the web UI.
# @raycast.author David

set -euo pipefail

ACTIVITYWATCH_URL="${ACTIVITYWATCH_URL:-http://localhost:5600/}"
ACTIVITYWATCH_APP="${ACTIVITYWATCH_APP:-ActivityWatch}"
MAX_WAIT_SECONDS="${ACTIVITYWATCH_WAIT_SECONDS:-15}"
T3_WATCHER_LABEL="${T3_WATCHER_LABEL:-com.activitywatch.aw-watcher-t3}"
T3_WATCHER_PLIST="${T3_WATCHER_PLIST:-$HOME/Library/LaunchAgents/${T3_WATCHER_LABEL}.plist}"

is_running() {
  pgrep -xq "$ACTIVITYWATCH_APP" || pgrep -xq "aw-qt"
}

server_ready() {
  curl -sf --max-time 1 "$ACTIVITYWATCH_URL" >/dev/null 2>&1
}

ensure_t3_watcher() {
  [[ -f "$T3_WATCHER_PLIST" ]] || return 0
  local domain="gui/$(id -u)"
  # Load if missing, then (re)start so T3 project tracking is up with AW.
  if ! launchctl print "$domain/$T3_WATCHER_LABEL" >/dev/null 2>&1; then
    launchctl bootstrap "$domain" "$T3_WATCHER_PLIST" 2>/dev/null || true
    launchctl enable "$domain/$T3_WATCHER_LABEL" 2>/dev/null || true
  fi
  launchctl kickstart -k "$domain/$T3_WATCHER_LABEL" 2>/dev/null || true
}

if ! is_running; then
  open -a "$ACTIVITYWATCH_APP"
fi

ensure_t3_watcher

if ! server_ready; then
  deadline=$((SECONDS + MAX_WAIT_SECONDS))
  while (( SECONDS < deadline )); do
    if server_ready; then
      break
    fi
    sleep 0.25
  done
fi

open "$ACTIVITYWATCH_URL"
