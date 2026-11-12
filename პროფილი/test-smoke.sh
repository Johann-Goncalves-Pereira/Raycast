#!/usr/bin/env bash
# Smoke checks for პროფილი.swift — no DMG mount required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$ROOT/პროფილი.swift"

fail() { echo "❌ $*" >&2; exit 1; }
pass() { echo "✅ $*"; }

[[ -f "$SCRIPT" ]] || fail "missing $SCRIPT"

# 1) Typecheck (same frameworks as runtime)
xcrun swiftc -typecheck \
  -sdk "$(xcrun --show-sdk-path)" \
  -framework AppKit \
  -framework LocalAuthentication \
  -framework Security \
  -framework IOKit \
  "$SCRIPT" \
  || fail "swiftc -typecheck failed"
pass "swiftc -typecheck"

# 2) Critical sleep/eject + watchdog contract symbols present
for needle in \
  'DesktopNotification' \
  'PowerManagement.acquireSleepAssertion' \
  'kIOPMAssertionTypePreventSystemSleep' \
  'NSWorkspace.willSleepNotification' \
  'NSWorkspace.didWakeNotification' \
  'auditVaultAfterWake' \
  'DiskImage.detach(at: mountPoint, urgent: true)' \
  'terminateProcessesUsingSecureProfile(urgent:' \
  'Vault already unmounted' \
  '--watchdog' \
  '--orphan-guard' \
  '--secure-orphan' \
  'VaultWatchdog.handoff' \
  'VaultSessionState' \
  'VaultLaunchAgent' \
  'startSessionWatchdog' \
  'ensureOrphanGuardInstalled' \
  'bootoutSessionWatchdog' \
  'shouldSecureOrphan' \
  'secureOrphanVault' \
  'handoffToWatchdog' \
  'com.johann.zen.secure-vault-watchdog' \
  'com.johann.zen.secure-vault-orphan-guard' \
  'secure-vault-session.json'
do
  rg -q -F -- "$needle" "$SCRIPT" || fail "missing required symbol/path: $needle"
done
pass "sleep/eject + watchdog contract symbols"

# 3) Repo-managed LaunchAgent templates exist
[[ -f "$ROOT/com.johann.zen.secure-vault-watchdog.plist" ]] \
  || fail "missing session watchdog plist template"
[[ -f "$ROOT/com.johann.zen.secure-vault-orphan-guard.plist" ]] \
  || fail "missing orphan-guard plist template"
rg -q 'com.johann.zen.secure-vault-watchdog' "$ROOT/com.johann.zen.secure-vault-watchdog.plist" \
  || fail "watchdog plist label mismatch"
rg -q 'KeepAlive' "$ROOT/com.johann.zen.secure-vault-orphan-guard.plist" \
  || fail "orphan-guard plist missing KeepAlive"
pass "LaunchAgent plist templates"

# 4) No force-unwrap / force-try / force-cast in production script
if rg -n 'try!|as!' "$SCRIPT"; then
  fail "force try/cast forbidden"
fi
# Flag Swift force-unwrap after identifiers (skip string bangs / != / shebang)
if rg -n '\w!\s|\w!\.|\w!\)|\w!,' "$SCRIPT" | rg -v '!=|#!/|//!'; then
  fail "possible force unwrap remains"
fi
pass "no force unwrap / try! / as!"

echo "All პროფილი smoke checks passed."
