#!/bin/bash

# ==============================================================================
# Raycast Script: macOS Appearance Toggle (Dark & Auto)
#
# This script is designed to be used with Raycast.
#
# Required Raycast parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Appearance (Dark/Auto)
# @raycast.mode silent
#
# Optional Raycast parameters:
# @raycast.icon 🌓
# @raycast.author Johann Pereira
# @raycast.description Toggles the system appearance on macOS between permanent "Dark" mode and "Auto" mode.
# @raycast.packageName System
#
# ==============================================================================
#
# How it works:
# It uses the `defaults` command to check and modify the current state of the
# appearance settings.
# - If "Auto" mode is enabled, it disables it and forces "Dark" mode.
# - If "Auto" mode is disabled (meaning it's in permanent Light or Dark),
#   it enables "Auto" mode.
# A system notification is displayed to confirm the change.
#
# ==============================================================================

# Check current auto-switch setting
AUTO_SWITCH=$(defaults read -g AppleInterfaceStyleSwitchesAutomatically 2>/dev/null || echo "0")
CURRENT_STYLE=$(defaults read -g AppleInterfaceStyle 2>/dev/null || echo "Light")

# Toggle logic using shortcuts
if [ "$AUTO_SWITCH" = "1" ]; then
    # Currently in Auto mode, switch to permanent Dark mode
    shortcuts run "Set.dark"
    MESSAGE="Switched to permanent Dark mode"
else
    # Currently in manual mode
    if [ "$CURRENT_STYLE" = "Dark" ]; then
        # Switch from Dark to Light
        shortcuts run "Set.light"
        MESSAGE="Switched to Light mode"
    else
        # Switch from Light to Dark
        shortcuts run "Set.dark"
        MESSAGE="Switched to Dark mode"
    fi
fi

# Wait for shortcut to complete
sleep 2

# Use terminal-notifier if available, otherwise use a simple echo
if command -v terminal-notifier >/dev/null 2>&1; then
    terminal-notifier -title "Theme Changed" -message "$MESSAGE" -sound Glass
else
    # Fallback: Use echo instead of problematic osascript
    echo "✅ Theme Changed: $MESSAGE"
    echo "� New style: $(defaults read -g AppleInterfaceStyle 2>/dev/null || echo 'Light')"
fi

# Alternative: Try using alerter if available
if command -v alerter >/dev/null 2>&1; then
    alerter -title "Theme Changed" -message "$MESSAGE" -sound Glass
fi

# Log for debugging (optional)
echo "$(date): $MESSAGE" >> ~/Library/Logs/raycast-theme-toggle.log