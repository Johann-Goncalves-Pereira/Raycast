#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Open I2P Zen Profile
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🌐
# @raycast.packageName Web Browsing
# @raycast.needsConfirmation false

# Documentation:
# @raycast.description Opens or focuses Zen Browser with the I2P profile
# @raycast.author Johann-Goncalves-Pereira
# @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira

set -euo pipefail

PROFILE_NAME="I2P"
ZEN_SUPPORT_DIR="${HOME}/Library/Application Support/zen"
PROFILES_INI="${ZEN_SUPPORT_DIR}/profiles.ini"

# Locate Zen Browser application
find_zen_app() {
  if [ -n "${ZEN_APP_PATH:-}" ] && [ -d "${ZEN_APP_PATH}" ]; then
    printf '%s\n' "${ZEN_APP_PATH}"
    return 0
  fi

  if [ -d "/Applications/Zen.app" ]; then
    printf '%s\n' "/Applications/Zen.app"
    return 0
  fi

  if [ -d "${HOME}/Applications/Zen.app" ]; then
    printf '%s\n' "${HOME}/Applications/Zen.app"
    return 0
  fi

  return 1
}

# Locate I2P profile directory
find_profile_dir() {
  # Try resolving via profiles.ini
  if [ -f "${PROFILES_INI}" ]; then
    local resolved_path
    resolved_path=$(python3 -c "
import configparser, os, sys

target = sys.argv[1].lower()
ini_path = os.path.expanduser(sys.argv[2])
config = configparser.ConfigParser(interpolation=None)

try:
    config.read(ini_path)
    for section in config.sections():
        if config.has_option(section, 'Name') and config.get(section, 'Name').strip().lower() == target:
            path = config.get(section, 'Path').strip()
            is_rel = config.get(section, 'IsRelative', fallback='1').strip()
            base_dir = os.path.dirname(ini_path)
            full_path = os.path.normpath(os.path.join(base_dir, path)) if is_rel == '1' else path
            if os.path.isdir(full_path):
                print(full_path)
                sys.exit(0)
except Exception:
    pass

sys.exit(1)
" "${PROFILE_NAME}" "${PROFILES_INI}" 2>/dev/null || true)

    if [ -n "${resolved_path}" ] && [ -d "${resolved_path}" ]; then
      printf '%s\n' "${resolved_path}"
      return 0
    fi
  fi

  # Fallback: scan Profiles directory for *.I2P or *.i2p
  local candidate
  candidate=$(find "${ZEN_SUPPORT_DIR}/Profiles" -maxdepth 1 -type d \( -iname "*.${PROFILE_NAME}" -o -iname "${PROFILE_NAME}" \) 2>/dev/null | head -n 1 || true)
  if [ -n "${candidate}" ] && [ -d "${candidate}" ]; then
    printf '%s\n' "${candidate}"
    return 0
  fi

  return 1
}

# Check if profile is currently running and get PID holding the parent lock
get_running_profile_pid() {
  local profile_path="$1"
  local lock_file="${profile_path}/.parentlock"

  if [ ! -f "${lock_file}" ]; then
    return 1
  fi

  local pid
  pid=$(lsof -t "${lock_file}" 2>/dev/null | head -n 1 || true)
  if [ -n "${pid}" ]; then
    printf '%s\n' "${pid}"
    return 0
  fi

  return 1
}

# Bring existing instance to front
focus_window() {
  local pid="$1"
  osascript -e '
    on run argv
      set targetPid to (item 1 of argv) as integer
      tell application "System Events"
        set matches to (every process whose unix id is targetPid)
        if (count of matches) > 0 then
          set targetProc to item 1 of matches
          set frontmost of targetProc to true
        end if
      end tell
    end run
  ' "${pid}" >/dev/null 2>&1
}

main() {
  local zen_app
  zen_app=$(find_zen_app) || {
    echo "❌ Zen Browser application not found in /Applications or ~/Applications."
    exit 1
  }

  local profile_dir
  profile_dir=$(find_profile_dir) || {
    echo "❌ Zen profile '${PROFILE_NAME}' not found."
    echo "Check ~/Library/Application Support/zen/profiles.ini"
    exit 1
  }

  local running_pid
  if running_pid=$(get_running_profile_pid "${profile_dir}"); then
    focus_window "${running_pid}"
    echo "Focused running Zen Browser (${PROFILE_NAME} profile)"
    exit 0
  fi

  # Launch new instance with the specified profile
  if ! open -n -a "${zen_app}" --args --new-instance -P "${PROFILE_NAME}" "$@"; then
    echo "❌ Failed to launch Zen Browser with profile '${PROFILE_NAME}'."
    exit 1
  fi

  echo "Opened Zen Browser (${PROFILE_NAME} profile)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
