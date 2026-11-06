#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/open-qui-desktop.sh"

echo "=== Running tests for open-qui-desktop ==="

echo "[1/3] Checking bash syntax..."
bash -n "${TARGET_SCRIPT}"
echo "✓ Syntax valid"

write_info_plist() {
  local app_root="$1"
  local bundle_id="$2"
  mkdir -p "${app_root}/Contents"
  cat >"${app_root}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${bundle_id}</string>
</dict>
</plist>
EOF
}

# shellcheck source=/dev/null
source "${TARGET_SCRIPT}"

echo "[2/3] Testing Tauri bundle detection..."
DETECT_TMP=$(mktemp -d)
write_info_plist "${DETECT_TMP}/SafariQui.app" "com.apple.Safari.WebApp.test"
write_info_plist "${DETECT_TMP}/Qui.app" "com.ukvdavi.qui"

if is_tauri_qui_app "${DETECT_TMP}/SafariQui.app"; then
  echo "FAIL: Safari web app must not match Tauri detector"
  rm -rf "${DETECT_TMP}"
  exit 1
fi
if ! is_tauri_qui_app "${DETECT_TMP}/Qui.app"; then
  echo "FAIL: Tauri bundle should be recognized"
  rm -rf "${DETECT_TMP}"
  exit 1
fi

QUI_DESKTOP_APP_PATH="${DETECT_TMP}/Qui.app"
FOUND=$(find_tauri_desktop_app)
if [ "${FOUND}" != "${DETECT_TMP}/Qui.app" ]; then
  echo "FAIL: find_tauri_desktop_app override failed"
  rm -rf "${DETECT_TMP}"
  exit 1
fi
unset QUI_DESKTOP_APP_PATH
rm -rf "${DETECT_TMP}"
echo "✓ Tauri desktop app detection works"

echo "[3/3] Testing launch (mocked open)..."
LAUNCH_TMP=$(mktemp -d)
write_info_plist "${LAUNCH_TMP}/Qui.app" "com.ukvdavi.qui"
export QUI_DESKTOP_APP_PATH="${LAUNCH_TMP}/Qui.app"
OPEN_LOG="${LAUNCH_TMP}/open.log"
: > "${OPEN_LOG}"
open() {
  printf '%s\n' "$*" >> "${OPEN_LOG}"
}
export OPEN_LOG
export -f open
OUTPUT=$("${TARGET_SCRIPT}")
if [[ "${OUTPUT}" != *"Opened Qui desktop wrapper"* ]]; then
  echo "FAIL: unexpected output: ${OUTPUT}"
  rm -rf "${LAUNCH_TMP}"
  exit 1
fi
if [ "$(tr -d '\n' < "${OPEN_LOG}")" != "${LAUNCH_TMP}/Qui.app" ]; then
  echo "FAIL: open called with wrong path: $(cat "${OPEN_LOG}")"
  rm -rf "${LAUNCH_TMP}"
  exit 1
fi
rm -rf "${LAUNCH_TMP}"
echo "✓ Launch invokes open on the desktop bundle"

echo "=== All tests passed! ==="
