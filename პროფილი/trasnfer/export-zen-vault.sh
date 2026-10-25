#!/usr/bin/env bash
# export-zen-vault.sh — run on the OLD Mac
# Bundles Profile.dmg + OpenSSL-encrypted Keychain passphrase.
# The vault passphrase never appears in the zip as plaintext.
set -euo pipefail
umask 077
set +o history 2>/dev/null || true

SERVICE="com.johann.zen.secure-vault"
ACCOUNT="Profile.dmg"
VAULT_DIR="${HOME}/Library/Application Support/zen/Profiles"
VAULT="${VAULT_DIR}/Profile.dmg"
OUT_DIR="${HOME}/Desktop"
STAMP="$(date +%Y%m%d-%H%M%S)"
ZIP="${OUT_DIR}/zen-encrypted-vault-${STAMP}.zip"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/zen-vault-export.XXXXXX")"

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
  if [[ -d "${STAGE}" ]]; then
    find "${STAGE}" -type f \( -name '*.pass' -o -name '*.tmp' -o -name 'vault-passphrase*' \) \
      -print0 2>/dev/null | while IFS= read -r -d '' f; do secure_rm "$f"; done
    rm -rf "${STAGE}"
  fi
  unset VAULT_PASS TRANSFER_PASS TRANSFER_PASS_CONFIRM OPENSSL_TRANSFER_PASS 2>/dev/null || true
}
trap cleanup EXIT

echo "Looking for encrypted vault DMG..."
if [[ ! -f "${VAULT}" ]]; then
  echo "Primary vault not at: ${VAULT}"
  echo "Searching for *.dmg under Zen Application Support..."
  FOUND=()
  while IFS= read -r line; do FOUND+=("$line"); done < <(
    find "${HOME}/Library/Application Support/zen" -type f -name '*.dmg' 2>/dev/null || true
  )
  if [[ ${#FOUND[@]} -eq 0 ]]; then
    echo "No .dmg found. Nothing to export."
    exit 1
  fi
  printf 'Found:\n%s\n' "${FOUND[@]}"
else
  FOUND=("${VAULT}")
  while IFS= read -r extra; do
    [[ "${extra}" == "${VAULT}" ]] && continue
    FOUND+=("${extra}")
  done < <(find "${VAULT_DIR}" -type f -name '*.dmg' 2>/dev/null || true)
fi

if hdiutil info 2>/dev/null | grep -Fq "${VAULT}"; then
  echo "Vault appears mounted. Quit Zen / eject first, then re-run."
  exit 1
fi

mkdir -p "${STAGE}/zen-vault"
MANIFEST="${STAGE}/zen-vault/MANIFEST.txt"
{
  echo "exported_at=${STAMP}"
  echo "host=$(scutil --get ComputerName 2>/dev/null || hostname)"
  echo "user=${USER}"
  echo "expected_path=~/Library/Application Support/zen/Profiles/Profile.dmg"
  echo "keychain_service=${SERVICE}"
  echo "keychain_account=${ACCOUNT}"
  echo "passphrase_blob=vault-passphrase.enc"
  echo "passphrase_cipher=aes-256-cbc-pbkdf2"
  echo "note=Vault passphrase is encrypted; transfer passphrase is NOT stored anywhere in this archive."
} > "${MANIFEST}"

for f in "${FOUND[@]}"; do
  rel="${f#"${HOME}/Library/Application Support/zen/"}"
  dest="${STAGE}/zen-vault/${rel}"
  mkdir -p "$(dirname "${dest}")"
  echo "Copying DMG: ${f}"
  ditto "${f}" "${dest}"
  echo "included=${rel}" >> "${MANIFEST}"
  echo "sha256_dmg=$(shasum -a 256 "${f}" | awk '{print $1}') path=${rel}" >> "${MANIFEST}"
done

echo ""
echo "Reading Keychain item (macOS may prompt for login keychain access)..."
echo "  service=${SERVICE}  account=${ACCOUNT}"

set +e
VAULT_PASS="$(security find-generic-password -s "${SERVICE}" -a "${ACCOUNT}" -w 2>/dev/null)"
SEC_STATUS=$?
set -e

if [[ ${SEC_STATUS} -ne 0 || -z "${VAULT_PASS}" ]]; then
  echo "Could not read Keychain item (status ${SEC_STATUS})."
  echo "Unlock login keychain, allow access when prompted, then re-run."
  exit 1
fi

echo ""
echo "Choose a TRANSFER passphrase (protects the Keychain secret inside the zip)."
echo "This is NOT your vault password — pick something temporary you will type on the new Mac."
echo "It will NOT be saved in the zip or this script."
read -r -s -p "Transfer passphrase: " TRANSFER_PASS
echo
read -r -s -p "Confirm transfer passphrase: " TRANSFER_PASS_CONFIRM
echo
if [[ -z "${TRANSFER_PASS}" || "${TRANSFER_PASS}" != "${TRANSFER_PASS_CONFIRM}" ]]; then
  echo "Transfer passphrases empty or mismatch."
  unset VAULT_PASS TRANSFER_PASS TRANSFER_PASS_CONFIRM
  exit 1
fi
unset TRANSFER_PASS_CONFIRM

ENC_OUT="${STAGE}/zen-vault/vault-passphrase.enc"
export OPENSSL_TRANSFER_PASS="${TRANSFER_PASS}"
unset TRANSFER_PASS

printf '%s' "${VAULT_PASS}" | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
  -pass env:OPENSSL_TRANSFER_PASS \
  -out "${ENC_OUT}"

VAULT_PASS="$(dd if=/dev/urandom bs=64 count=1 2>/dev/null | base64 | head -c 64 || true)"
unset VAULT_PASS
unset OPENSSL_TRANSFER_PASS

chmod 600 "${ENC_OUT}"
echo "sha256_enc=$(shasum -a 256 "${ENC_OUT}" | awk '{print $1}')" >> "${MANIFEST}"

ditto -c -k --sequesterRsrc --keepParent "${STAGE}/zen-vault" "${ZIP}"
chmod 600 "${ZIP}"

echo ""
echo "Created: ${ZIP}"
ls -lh "${ZIP}"
echo ""
echo "Remember the TRANSFER passphrase (only way to unlock vault-passphrase.enc)."
echo "Delete this zip from both machines after a successful import."
