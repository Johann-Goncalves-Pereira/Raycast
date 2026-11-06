#!/usr/bin/env bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Open Qui
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🌐
# @raycast.packageName Applications
# @raycast.needsConfirmation false

# Documentation:
# @raycast.description Checks if Qui is running (starts it if needed) and opens its Safari desktop app
# @raycast.author Johann-Goncalves-Pereira
# @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

CONTAINER_NAME="qui"
IMAGE_NAME="ghcr.io/autobrr/qui:latest"
QUI_PORT="7476"
QUI_URL="http://localhost:${QUI_PORT}"
CONFIG_DIR="${QUI_CONFIG_DIR:-${HOME}/Developer/programs/qui/config}"
# Native Tauri wrapper (optional); Raycast should prefer a Safari web app instead.
TAURI_BUNDLE_ID="${QUI_TAURI_BUNDLE_ID:-com.ukvdavi.qui}"

bundle_id_for_app() {
  local app_path="$1"
  defaults read "${app_path}/Contents/Info" CFBundleIdentifier 2>/dev/null || true
}

# Safari "Add to Dock" web apps — not the optional Tauri `Qui.app` wrapper.
is_safari_web_app() {
  local app_path="$1"
  local plist="${app_path}/Contents/Info.plist"
  if [ ! -f "${plist}" ]; then
    return 1
  fi

  local bundle_id
  bundle_id=$(bundle_id_for_app "${app_path}")
  if [ -z "${bundle_id}" ]; then
    return 1
  fi

  if [ "${bundle_id}" = "${TAURI_BUNDLE_ID}" ]; then
    return 1
  fi

  case "${bundle_id}" in
    com.apple.Safari.WebApp.* | com.apple.wk2bundleidentifier.* | com.apple.webapp.*)
      return 0
      ;;
  esac

  if grep -qE 'SafariWebApp|WebApp|WKAppBundleIdentifier' "${plist}" 2>/dev/null; then
    return 0
  fi

  return 1
}

# Detect Safari Web App (.app) created via Safari "File > Add to Dock..."
find_safari_app() {
  # 1. Custom override path if provided
  if [ -n "${QUI_APP_PATH:-}" ] && [ -d "${QUI_APP_PATH}" ]; then
    printf '%s\n' "${QUI_APP_PATH}"
    return 0
  fi

  # 2. Check standard Safari web app paths (skip native Tauri bundle IDs)
  local candidate
  for candidate in \
    "${HOME}/Applications/qui.app" \
    "${HOME}/Applications/Qui.app" \
    "/Applications/qui.app" \
    "/Applications/Qui.app"; do
    if [ -d "${candidate}" ] && is_safari_web_app "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  # 3. Case-insensitive search for *qui*.app that are Safari web apps
  while IFS= read -r candidate; do
    if [ -n "${candidate}" ] && is_safari_web_app "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done < <(find "${HOME}/Applications" "/Applications" -maxdepth 1 -iname "*qui*.app" 2>/dev/null || true)

  # 4. Search ~/Applications for a web app bundle referencing port 7476
  candidate=$(grep -rl "${QUI_PORT}" "${HOME}/Applications"/*.app/Contents 2>/dev/null | head -n 1 || true)
  if [ -n "${candidate}" ]; then
    local app_dir="${candidate%%/Contents/*}.app"
    if [ -d "${app_dir}" ] && is_safari_web_app "${app_dir}"; then
      printf '%s\n' "${app_dir}"
      return 0
    fi
  fi

  return 1
}

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  # Attempt starting Colima if installed
  if command -v colima >/dev/null 2>&1; then
    colima start >/dev/null 2>&1 || true
    if docker info >/dev/null 2>&1; then
      return 0
    fi
  fi

  # Attempt opening Docker Desktop if installed
  if [ -d "/Applications/Docker.app" ]; then
    open -a "Docker"
    local retries=15
    while [ "${retries}" -gt 0 ]; do
      if docker info >/dev/null 2>&1; then
        return 0
      fi
      sleep 1
      retries=$((retries - 1))
    done
  fi

  return 1
}

is_qui_container_running() {
  local state
  state=$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)
  [ "${state}" = "true" ]
}

ensure_qui_running() {
  if is_qui_container_running; then
    return 0
  fi

  ensure_docker_running || {
    echo "❌ Docker is not running. Please start Docker or Colima."
    exit 1
  }

  local container_exists
  container_exists=$(docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format '{{.ID}}' 2>/dev/null || true)

  if [ -n "${container_exists}" ]; then
    docker start "${CONTAINER_NAME}" >/dev/null
  else
    mkdir -p "${CONFIG_DIR}"
    docker run -d \
      --name "${CONTAINER_NAME}" \
      --restart unless-stopped \
      -p "${QUI_PORT}:${QUI_PORT}" \
      -v "${CONFIG_DIR}:/config" \
      "${IMAGE_NAME}" >/dev/null
  fi

  # Poll HTTP endpoint until ready
  local retries=20
  while [ "${retries}" -gt 0 ]; do
    if curl -s -f -o /dev/null "${QUI_URL}/" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
    retries=$((retries - 1))
  done

  echo "❌ Qui did not respond at ${QUI_URL} after starting the container." >&2
  return 1
}

open_qui_page() {
  local safari_app
  safari_app=$(find_safari_app || true)

  if [ -n "${safari_app}" ]; then
    open "${safari_app}"
    return 0
  fi

  # Fallback when Safari web app hasn't been created yet
  open -a "Safari" "${QUI_URL}"
  return 2
}

main() {
  local was_already_running=false
  if is_qui_container_running; then
    was_already_running=true
  fi

  ensure_qui_running || exit 1

  local open_status=0
  open_qui_page || open_status=$?

  if [ "${open_status}" -eq 0 ]; then
    if [ "${was_already_running}" = "true" ]; then
      echo "✅ Focused Qui app"
    else
      echo "🚀 Started Qui & opened app"
    fi
  else
    if [ "${was_already_running}" = "true" ]; then
      echo "✅ Qui is running (opened in Safari — add to Dock for web app)"
    else
      echo "🚀 Started Qui (opened in Safari — add to Dock for web app)"
    fi
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
