#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/open-qui.sh"

echo "=== Running tests for open-qui ==="

# 1. Syntax check
echo "[1/6] Checking bash syntax..."
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

# 2. Test Safari app detection override
echo "[2/6] Testing QUI_APP_PATH override..."
TEST_TMP=$(mktemp -d)
write_info_plist "${TEST_TMP}/qui.app" "com.apple.Safari.WebApp.test-override"
QUI_APP_PATH="${TEST_TMP}/qui.app"
DETECTED_PATH=$(find_safari_app)
if [ "${DETECTED_PATH}" != "${TEST_TMP}/qui.app" ]; then
  echo "FAIL: QUI_APP_PATH override failed"
  rm -rf "${TEST_TMP}"
  exit 1
fi
unset QUI_APP_PATH
rm -rf "${TEST_TMP}"
echo "✓ QUI_APP_PATH override works"

# 3. Safari web app vs Tauri bundle discrimination
echo "[3/6] Testing Safari web app detection heuristics..."
DISCRIM_TMP=$(mktemp -d)
write_info_plist "${DISCRIM_TMP}/TauriQui.app" "com.ukvdavi.qui"
write_info_plist "${DISCRIM_TMP}/SafariQui.app" "com.apple.Safari.WebApp.test-qui"

if is_safari_web_app "${DISCRIM_TMP}/TauriQui.app"; then
  echo "FAIL: Tauri bundle should not be classified as Safari web app"
  rm -rf "${DISCRIM_TMP}"
  exit 1
fi
if ! is_safari_web_app "${DISCRIM_TMP}/SafariQui.app"; then
  echo "FAIL: Safari web app bundle should be recognized"
  rm -rf "${DISCRIM_TMP}"
  exit 1
fi
rm -rf "${DISCRIM_TMP}"
echo "✓ Safari web app heuristics exclude Tauri wrapper"

docker() {
  case "$1" in
    inspect)
      if [ "$2" = "-f" ]; then
        printf '%s\n' "true"
        return 0
      fi
      ;;
    ps)
      if [ "$2" = "-a" ]; then
        printf '%s\n' "mock-container-id"
        return 0
      fi
      ;;
  esac
  echo "FAIL: unexpected docker invocation: $*" >&2
  return 1
}
export -f docker

# 4. Test Qui container running check (mocked — no Docker required)
echo "[4/6] Testing container running detection..."
if ! is_qui_container_running; then
  echo "FAIL: Expected qui container to be reported as running"
  exit 1
fi
echo "✓ Qui container correctly identified as running"

# 5. Test script execution when qui is already up (mocked docker/open)
echo "[5/6] Testing main script execution..."
TEST_APP_TMP=$(mktemp -d)
write_info_plist "${TEST_APP_TMP}/Qui.app" "com.apple.Safari.WebApp.test-main"
export QUI_APP_PATH="${TEST_APP_TMP}/Qui.app"

open() {
  echo "Mock open called with: $*"
}
export -f open

OUTPUT=$("${TARGET_SCRIPT}")
echo "Script output: ${OUTPUT}"
if [[ "${OUTPUT}" != *"Focused Qui app"* ]]; then
  echo "FAIL: Unexpected output: ${OUTPUT}"
  rm -rf "${TEST_APP_TMP}"
  exit 1
fi
rm -rf "${TEST_APP_TMP}"
unset QUI_APP_PATH
echo "✓ Script execution returned expected status"

# 6. ensure_qui_running fails when HTTP never becomes ready
echo "[6/6] Testing readiness failure when HTTP stays down..."
is_qui_container_running() {
  return 1
}
ensure_docker_running() {
  return 0
}
docker() {
  case "$1" in
    ps)
      if [ "$2" = "-a" ]; then
        printf '%s\n' "mock-container-id"
        return 0
      fi
      ;;
    start)
      return 0
      ;;
  esac
  echo "FAIL: unexpected docker invocation in readiness test: $*" >&2
  return 1
}
curl() {
  return 1
}
export -f curl docker ensure_docker_running is_qui_container_running

if ensure_qui_running; then
  echo "FAIL: ensure_qui_running should fail when curl never succeeds"
  exit 1
fi
echo "✓ Readiness failure is reported when HTTP stays down"

echo "=== All tests passed! ==="
