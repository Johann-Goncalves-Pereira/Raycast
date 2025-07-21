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
# @raycast.author Gemini
# @raycast.description Toggles the system appearance on macOS between permanent "Dark" mode and "Auto" mode.
# @raycast.packageName System
#
# ==============================================================================
#
# How it works:
# It uses AppleScript (`osascript`) to check the current state of the
# "automatic" appearance setting.
# - If "Auto" is enabled, it disables it and forces "Dark" mode.
# - If "Auto" is disabled (meaning it's in permanent Light or Dark),
#   it enables "Auto" mode.
# A system notification is displayed to confirm the change.
#
# ==============================================================================

# This first AppleScript block does the logic of toggling the setting.
osascript <<'EOF'
tell application "System Events"
	tell appearance preferences
		-- Check if the 'automatic' setting is currently true
		if automatic is true then
			-- If it is "Auto", switch to permanent "Dark" mode.
			-- First, disable automatic switching.
			set automatic to false
			-- Then, explicitly enable dark mode.
			set dark mode to true
		else
			-- If it is not "Auto" (i.e., it's in permanent Light or Dark mode),
			-- switch to "Auto" mode.
			set automatic to true
		end if
	end tell
end tell
EOF

# This second AppleScript block displays a notification to confirm the change.
osascript <<'EOF'
tell application "System Events"
	tell appearance preferences
		if automatic is true then
			display notification "Appearance set to Auto mode." with title "Theme Changed"
		else
			display notification "Appearance set to Dark mode." with title "Theme Changed"
		end if
	end tell
end tell
EOF