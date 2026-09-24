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
# @raycast.description Type clipboard with humanized timing. Bind hotkey to Raycast ✦+V (not ⌥V).
# @raycast.author Johann-Goncalves-Pereira
# @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira

# Raycast aborts script commands after ~30s. This wrapper snapshots the clipboard,
# detaches the typer, and returns immediately.

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
  /usr/bin/osascript -e "display notification \"$1\" with title \"Humanized Type\"" >/dev/null 2>&1 || true
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

# Snapshot clipboard before Raycast / focus churn can race the pasteboard.
CLIP_FILE="$(mktemp "${TMPDIR:-/tmp}/humanized-type.XXXXXX")"
if ! /usr/bin/pbpaste >"$CLIP_FILE" 2>/dev/null; then
  rm -f "$CLIP_FILE"
  fail "Could not read clipboard (pbpaste failed)."
fi

CLIP_BYTES="$(wc -c <"$CLIP_FILE" | tr -d ' ')"
if [[ "$CLIP_BYTES" -eq 0 ]]; then
  rm -f "$CLIP_FILE"
  fail "Clipboard is empty. Copy text, focus a field, then press your Raycast hotkey (✦V)."
fi

log "clipboard snapshot bytes=$CLIP_BYTES file=$CLIP_FILE"

# New session so Raycast does not kill the typer when this script exits.
python3 - "$BIN" "$LOG" "$CLIP_FILE" "$@" <<'PY'
import os
import sys

binary = sys.argv[1]
log_path = sys.argv[2]
clip_file = sys.argv[3]
rest = sys.argv[4:]
argv = [binary, "--input-file", clip_file, *rest]
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
os.execv(binary, argv)
PY

log "detached typer"
exit 0
