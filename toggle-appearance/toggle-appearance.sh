#!/bin/bash

# ==============================================================================
# Raycast Script: macOS Appearance Toggle (Dark & Light)
#
# This script is designed to be used with Raycast.
#
# Required Raycast parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Appearance
# @raycast.mode silent
#
# Optional Raycast parameters:
# @raycast.icon 🌓
# @raycast.author Johann Pereira
# @raycast.description Toggles between Dark and Light appearance modes via System Events.
# @raycast.packageName System
#
# ==============================================================================
#
# How it works:
# Reads the current System Events dark-mode flag, flips it, then verifies the
# change stuck. Exits non-zero if Automation permission is missing or the
# appearance did not flip, so Raycast silent mode surfaces a failure toast.
#
# First run may prompt for Automation access (System Events).
#
# ==============================================================================

set -euo pipefail

LOG_FILE="${HOME}/Library/Logs/raycast-theme-toggle.log"

read_dark_mode() {
  osascript -e 'tell application "System Events" to tell appearance preferences to get dark mode'
}

BEFORE="$(read_dark_mode)" || {
  echo "❌ Cannot read appearance (grant Automation access for System Events)."
  exit 1
}

osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to not dark mode' || {
  echo "❌ Cannot toggle appearance (grant Automation access for System Events)."
  exit 1
}

AFTER="$(read_dark_mode)" || {
  echo "❌ Appearance read failed after toggle."
  exit 1
}

if [ "$BEFORE" = "$AFTER" ]; then
  echo "❌ Appearance did not change (was: $BEFORE)."
  echo "$(date): FAILED — appearance stuck at $BEFORE" >> "$LOG_FILE"
  exit 1
fi

if [ "$AFTER" = "true" ]; then
  MESSAGE="Switched to Dark mode"
else
  MESSAGE="Switched to Light mode"
fi

echo "✅ $MESSAGE"
echo "🎨 New style: $AFTER"
echo "$(date): $MESSAGE" >> "$LOG_FILE"
