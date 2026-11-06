#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_DIR="${QUI_INSTALL_DIR:-${HOME}/Applications}"

cd "${ROOT}"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required to run the Tauri CLI." >&2
  exit 1
fi

echo "==> Installing Tauri CLI dependencies..."
npm install --no-fund --no-audit

echo "==> Building frameless Qui desktop app (release)..."
npm run build

BUNDLE="${ROOT}/src-tauri/target/release/bundle/macos/Qui.app"
if [ ! -d "${BUNDLE}" ]; then
  echo "❌ Expected bundle at ${BUNDLE}" >&2
  exit 1
fi

echo "==> Installing to ${INSTALL_DIR}/Qui.app ..."
rm -rf "${INSTALL_DIR}/Qui.app"
cp -R "${BUNDLE}" "${INSTALL_DIR}/"
echo "✅ Installed ${INSTALL_DIR}/Qui.app"
