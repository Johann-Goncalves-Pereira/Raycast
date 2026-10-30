#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/open-i2p-zen-profile.sh"

echo "=== Running tests for open-i2p-zen-profile ==="

# 1. Syntax check
echo "[1/4] Checking bash syntax..."
bash -n "${TARGET_SCRIPT}"
echo "✓ Syntax valid"

# Source the target script
# shellcheck source=/dev/null
source "${TARGET_SCRIPT}"

# 2. Test app detection
echo "[2/4] Testing Zen Browser app detection..."
APP_PATH=$(find_zen_app)
if [ ! -d "${APP_PATH}" ]; then
  echo "FAIL: find_zen_app returned invalid path: ${APP_PATH}"
  exit 1
fi
echo "✓ Found Zen app: ${APP_PATH}"

# Test custom ZEN_APP_PATH override
TEST_TMP=$(mktemp -d)
mkdir -p "${TEST_TMP}/CustomZen.app"
ZEN_APP_PATH="${TEST_TMP}/CustomZen.app"
OVERRIDE_PATH=$(find_zen_app)
if [ "${OVERRIDE_PATH}" != "${TEST_TMP}/CustomZen.app" ]; then
  echo "FAIL: ZEN_APP_PATH override failed"
  rm -rf "${TEST_TMP}"
  exit 1
fi
unset ZEN_APP_PATH
rm -rf "${TEST_TMP}"
echo "✓ ZEN_APP_PATH override works"

# 3. Test profile detection
echo "[3/4] Testing profile directory resolution..."
RESOLVED_PROFILE=$(find_profile_dir)
if [ ! -d "${RESOLVED_PROFILE}" ]; then
  echo "FAIL: Resolved profile is not a valid directory: ${RESOLVED_PROFILE}"
  exit 1
fi
echo "✓ Found I2P profile directory: ${RESOLVED_PROFILE}"

# 4. Test lock detection logic
echo "[4/4] Testing lock detection..."
# Test with a dummy profile directory that has no lock
DUMMY_DIR=$(mktemp -d)
if get_running_profile_pid "${DUMMY_DIR}" >/dev/null 2>&1; then
  echo "FAIL: Dummy directory reported active lock"
  rm -rf "${DUMMY_DIR}"
  exit 1
fi
rm -rf "${DUMMY_DIR}"
echo "✓ Unlocked profile correctly detected as inactive"

echo "=== All tests passed! ==="
