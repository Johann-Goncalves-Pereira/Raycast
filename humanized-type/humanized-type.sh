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

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT/.build/release/humanized-type"

if [[ ! -x "$BIN" ]]; then
  swift build -c release --package-path "$ROOT"
fi

exec "$BIN" "$@"
