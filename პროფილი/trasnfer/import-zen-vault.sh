#!/usr/bin/env bash
# import-zen-vault.sh — run on the NEW Mac
# Usage:
#   ./import-zen-vault.sh /path/to/zen-encrypted-vault-....zip [/path/to/პროფილი.swift]
#   TRANSFER_PASS='...' ./import-zen-vault.sh ...   # non-interactive (env cleared after use)
set -euo pipefail
umask 077
set +o history 2>/dev/null || true

SERVICE="com.johann.zen.secure-vault"
ACCOUNT="Profile.dmg"
DEST_DIR="${HOME}/Library/Application Support/zen/Profiles"
DEST="${DEST_DIR}/Profile.dmg"

ZIP="${1:-}"
PROFILI_SWIFT="${2:-}"

if [[ -z "${ZIP}" || ! -f "${ZIP}" ]]; then
  echo "Usage: $0 /path/to/zen-encrypted-vault-....zip [/path/to/პროფილი.swift]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -z "${PROFILI_SWIFT}" ]]; then
  CANDIDATES=(
    "${SCRIPT_DIR}/პროფილი.swift"
    "${HOME}/Developer/programs/Raycast/პროფილი/პროფილი.swift"
  )
  for c in "${CANDIDATES[@]}"; do
    [[ -f "$c" ]] && PROFILI_SWIFT="$c" && break
  done
fi

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/zen-vault-import.XXXXXX")"
PLAIN_TMP=""

secure_rm() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  local sz
  sz=$(stat -f%z "$f" 2>/dev/null || echo 0)
  if [[ "$sz" -gt 0 ]]; then
    dd if=/dev/urandom of="$f" bs=1024 count=$(( (sz + 1023) / 1024 )) conv=notrunc 2>/dev/null || true
  fi
  rm -f "$f"
}

cleanup() {
  [[ -n "${PLAIN_TMP}" ]] && secure_rm "${PLAIN_TMP}"
  if [[ -d "${STAGE}" ]]; then
    find "${STAGE}" -type f \( -name '*.pass' -o -name '*.tmp' -o -name 'plain-*' \) \
      -print0 2>/dev/null | while IFS= read -r -d '' f; do secure_rm "$f"; done
    rm -rf "${STAGE}"
  fi
  unset OPENSSL_TRANSFER_PASS VAULT_PASS TRANSFER_PASS 2>/dev/null || true
}
trap cleanup EXIT

echo "Extracting ${ZIP}..."
ditto -x -k "${ZIP}" "${STAGE}"

ROOT="${STAGE}/zen-vault"
if [[ ! -d "${ROOT}" ]]; then
  ROOT="$(find "${STAGE}" -type d -name 'zen-vault' | head -1)"
fi
[[ -d "${ROOT}" ]] || { echo "Unexpected zip layout"; find "${STAGE}" -maxdepth 3; exit 1; }

SRC="$(find "${ROOT}" -type f -name 'Profile.dmg' | head -1)"
ENC="${ROOT}/vault-passphrase.enc"
[[ -n "${SRC}" && -f "${SRC}" ]] || { echo "No Profile.dmg in archive"; exit 1; }
[[ -f "${ENC}" ]] || { echo "No vault-passphrase.enc in archive — Keychain secret missing"; exit 1; }

mkdir -p "${DEST_DIR}"
if [[ -e "${DEST}" ]]; then
  BAK="${DEST}.bak.$(date +%Y%m%d-%H%M%S)"
  echo "Existing vault → ${BAK}"
  mv "${DEST}" "${BAK}"
fi

echo "Installing DMG → ${DEST}"
ditto "${SRC}" "${DEST}"
chmod 600 "${DEST}"

while IFS= read -r extra; do
  base="$(basename "${extra}")"
  [[ "${base}" == "Profile.dmg" ]] && continue
  ditto "${extra}" "${DEST_DIR}/${base}"
  chmod 600 "${DEST_DIR}/${base}"
done < <(find "${ROOT}" -type f -name '*.dmg' 2>/dev/null || true)

if [[ -n "${TRANSFER_PASS:-}" ]]; then
  export OPENSSL_TRANSFER_PASS="${TRANSFER_PASS}"
  unset TRANSFER_PASS
else
  echo ""
  echo "Decrypt Keychain secret (enter the TRANSFER passphrase from export)."
  read -r -s -p "Transfer passphrase: " OPENSSL_TRANSFER_PASS
  echo
  export OPENSSL_TRANSFER_PASS
fi

PLAIN_TMP="$(mktemp "${STAGE}/plain-XXXXXX")"
chmod 600 "${PLAIN_TMP}"

if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -pass env:OPENSSL_TRANSFER_PASS \
  -in "${ENC}" -out "${PLAIN_TMP}"; then
  echo "Decrypt failed (wrong transfer passphrase or corrupt blob)."
  unset OPENSSL_TRANSFER_PASS
  exit 1
fi
unset OPENSSL_TRANSFER_PASS

store_via_profili() {
  swift "${PROFILI_SWIFT}" --store-vault-password < "${PLAIN_TMP}"
}

store_via_security() {
  local pass
  pass="$(cat "${PLAIN_TMP}")"
  security delete-generic-password -s "${SERVICE}" -a "${ACCOUNT}" 2>/dev/null || true
  security add-generic-password \
    -s "${SERVICE}" \
    -a "${ACCOUNT}" \
    -w "${pass}" \
    -T "" \
    -U
  pass="$(dd if=/dev/urandom bs=64 count=1 2>/dev/null | base64 | head -c 64 || true)"
  unset pass
}

echo "Writing Keychain item ${SERVICE} / ${ACCOUNT}..."
if [[ -n "${PROFILI_SWIFT}" && -f "${PROFILI_SWIFT}" ]]; then
  store_via_profili
else
  echo "პროფილი.swift not found — using security(1) fallback (slightly weaker: -w on argv)."
  store_via_security
fi

secure_rm "${PLAIN_TMP}"
PLAIN_TMP=""

[[ -f "${ROOT}/MANIFEST.txt" ]] && { echo ""; cat "${ROOT}/MANIFEST.txt"; }

echo ""
echo "Done. DMG at ${DEST}"
echo "Verify: run პროფილი (Touch ID should unlock). Then delete the zip everywhere."
