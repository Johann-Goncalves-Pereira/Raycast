#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Humanized Type
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ⌨️
# @raycast.packageName Utilities
# @raycast.needsConfirmation false

# Documentation:
# @raycast.description Type clipboard text with humanized biomechanical timing
# @raycast.author Johann-Goncalves-Pereira
# @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira

# Raycast aborts script commands after ~30s (scriptCommands.runScript timeout).
# Typing a real clipboard takes longer, so this wrapper detaches the typer
# into its own session and returns immediately. Failures go to the log file.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT/.build/release/humanized-type"
LOG="${HOME}/Library/Logs/humanized-type.log"
mkdir -p "${HOME}/Library/Logs"

log() {
  printf '%s INFO wrapper %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"$LOG"
}

fail() {
  printf '%s FAIL wrapper %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"$LOG"
  printf '%s\n' "$*"
  exit 1
}

log "start pid=$$ bin=$BIN"

if [[ ! -x "$BIN" ]]; then
  log "release binary missing; building"
  if ! swift build -c release --package-path "$ROOT" >>"$LOG" 2>&1; then
    fail "swift build failed. See $LOG"
  fi
fi

if [[ ! -x "$BIN" ]]; then
  fail "binary still missing at $BIN"
fi

# New session so Raycast does not kill the typer when this script exits.
python3 - "$BIN" "$LOG" "$@" <<'PY'
import os
import sys

binary = sys.argv[1]
log_path = sys.argv[2]
rest = sys.argv[3:]
pid = os.fork()
if pid > 0:
    raise SystemExit(0)
os.setsid()
fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(fd, 1)
os.dup2(fd, 2)
os.close(fd)
devnull = os.open("/dev/null", os.O_RDONLY)
os.dup2(devnull, 0)
os.close(devnull)
os.execv(binary, [binary, *rest])
PY

log "detached typer"
exit 0
