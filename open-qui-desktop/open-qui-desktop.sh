#!/usr/bin/env bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Open Qui Desktop
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🖥️
# @raycast.packageName Applications
# @raycast.needsConfirmation false

# Documentation:
# @raycast.description Launch the frameless Tauri Qui wrapper (Docker lifecycle + Zen Annonimo)
# @raycast.author Johann-Goncalves-Pereira
# @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

TAURI_BUNDLE_ID="${QUI_TAURI_BUNDLE_ID:-com.ukvdavi.qui}"

find_tauri_desktop_app() {
  if [ -n "${QUI_DESKTOP_APP_PATH:-}" ] && [ -d "${QUI_DESKTOP_APP_PATH}" ]; then
    printf '%s\n' "${QUI_DESKTOP_APP_PATH}"
    return 0
  fi

  local candidate
  for candidate in \
    "${HOME}/Applications/Qui.app" \
    "/Applications/Qui.app"; do
    if [ -d "${candidate}" ] && is_tauri_qui_app "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

is_tauri_qui_app() {
  local app_path="$1"
  local plist="${app_path}/Contents/Info.plist"
  [ -f "${plist}" ] || return 1
  local bundle_id
  bundle_id=$(defaults read "${app_path}/Contents/Info" CFBundleIdentifier 2>/dev/null || true)
  [ "${bundle_id}" = "${TAURI_BUNDLE_ID}" ]
}

main() {
  local app_path
  if ! app_path=$(find_tauri_desktop_app); then
    echo "❌ Qui desktop app not found. Build with: ./qui-app/scripts/build-and-install-macos.sh" >&2
    exit 1
  fi

  open "${app_path}"
  echo "🚀 Opened Qui desktop wrapper"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
