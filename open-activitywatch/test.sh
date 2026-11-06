#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SCRIPT="${SCRIPT_DIR}/open-activitywatch.sh"

echo "=== Running tests for open-activitywatch ==="

# 1. Syntax check
echo "[1/3] Checking bash syntax..."
bash -n "${TARGET_SCRIPT}"
echo "✓ Syntax valid"

# 2. Check metadata format
echo "[2/3] Validating Raycast script command metadata..."
grep -q "@raycast.schemaVersion 1" "${TARGET_SCRIPT}"
grep -q "@raycast.title ActivityWatch" "${TARGET_SCRIPT}"
grep -q "@raycast.mode silent" "${TARGET_SCRIPT}"
grep -q "@raycast.icon icon.png" "${TARGET_SCRIPT}"
echo "✓ Raycast metadata valid"

# 3. Test execution helper functions
echo "[3/3] Testing script structure and helpers..."
# Verify function declarations exist
grep -q "is_running()" "${TARGET_SCRIPT}"
grep -q "server_ready()" "${TARGET_SCRIPT}"
grep -q "ensure_t3_watcher()" "${TARGET_SCRIPT}"
echo "✓ Functions present"

echo "=== All tests passed! ==="
