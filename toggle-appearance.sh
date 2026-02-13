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
# @raycast.description Toggles between Dark and Light appearance modes using Shortcuts app.
# @raycast.packageName System
#
# ==============================================================================
#
# How it works:
# It uses Shortcuts app (Set.dark and Set.light) to reliably change the appearance.
# The script checks the current state and toggles appropriately:
# - If in "Auto" mode: switches to permanent "Dark" mode
# - If in "Dark" mode: switches to "Light" mode  
# - If in "Light" mode: switches to "Dark" mode
# This ensures immediate visual changes without requiring logout/restart.
#
# ==============================================================================

# Check current auto-switch setting and style
AUTO_SWITCH=$(defaults read -g AppleInterfaceStyleSwitchesAutomatically 2>/dev/null || echo "0")
CURRENT_STYLE=$(defaults read -g AppleInterfaceStyle 2>/dev/null || echo "Light")

# Toggle logic using shortcuts
if [ "$AUTO_SWITCH" = "1" ]; then
    # Currently in Auto mode, switch to permanent Dark mode
    shortcuts run "Set.dark"
    MESSAGE="Switched to permanent Dark mode"
else
    # Currently in manual mode - toggle between Dark and Light
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

# Display result
echo "✅ $MESSAGE"
echo "🎨 New style: $(defaults read -g AppleInterfaceStyle 2>/dev/null || echo 'Light')"

# Log for debugging (optional)
echo "$(date): $MESSAGE" >> ~/Library/Logs/raycast-theme-toggle.log
