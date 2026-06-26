# პროფილი — Zen Secure Profile Launcher

Raycast script that mounts an encrypted DMG vault, launches Zen Browser with a secure profile, monitors the session for security events, and ejects the vault when the session ends.

**Source:** [`პროფილი.swift`](პროფილი.swift)

---

## Overview

| Property | Value |
|---|---|
| Raycast title | პროფილი |
| Mode | `silent` |
| Language | Swift (`#!/usr/bin/swift`) |
| Package | Utilities |
| Author | Johann-Goncalves-Pereira |

The script stays alive in the background while Zen is open on a **secure profile** (mounted DMG). It listens for macOS sleep, screen lock, and Zen quit events, then tears down the session and ejects the encrypted volume.

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph entry [Entry Point]
        Raycast[Raycast / CLI]
        Run[ProfileLauncher.run]
    end

    subgraph dmg [DMG Layer]
        CheckMount[DiskImage.mountStatus]
        Mount[DiskImage.attach with mountpoint]
        Footprint[HostFootprint purge]
        Eject[DiskImage.detach]
    end

    subgraph apps [Application Layer]
        Keychain[VaultCredentialStore.retrieveWithBiometrics]
        ProtonPass[ProtonPassApp.openWhenZenIsNotRunning]
        Zen[ZenBrowserLauncher.launch]
        Monitor[SecureZenSessionMonitor]
    end

    subgraph profiles [Profile Paths]
        Secure[SecureVaultWorkflow.run]
        Personal[PersonalProfileWorkflow.run]
    end

    Raycast --> Run
    Run --> CheckMount
    CheckMount -->|already mounted| Secure
    CheckMount -->|not mounted| Keychain
    Keychain -->|password retrieved| Mount
    Keychain -->|cancel or not configured| ProtonPass
    ProtonPass --> Mount
    Mount -->|success| Secure
    Mount -->|auth cancelled| Personal
    Secure --> Zen
    Zen --> Monitor
    Monitor --> Footprint
    Footprint --> Eject
    Personal --> Zen
```

---

## Main Workflow Decision Tree

```mermaid
flowchart TD
    Start([ProfileLauncher.run]) --> ValidateDMG{DMG file exists?}
    ValidateDMG -->|No| Exit1([exit 1])
    ValidateDMG -->|Yes| CheckMounted{DMG already mounted?}

    CheckMounted -->|Yes| SecureSkipPass[SecureVaultWorkflow<br/>terminateProtonPassAfterLaunch: false]
    CheckMounted -->|No| TouchID[VaultCredentialStore.retrieveWithBiometrics]

    TouchID -->|password retrieved| StdinMount[DiskImage.attach with -stdinpass]
    TouchID -->|cancel / not configured| OpenPass[ProtonPassApp.openWhenZenIsNotRunning]
    StdinMount -->|auth error| OpenPass

    OpenPass --> TryMount{DiskImage.attach interactive}
    StdinMount -->|Success| SecureTouchID[SecureVaultWorkflow<br/>terminateProtonPassAfterLaunch: false]
    TryMount -->|Success| SecureKillPass[SecureVaultWorkflow<br/>terminateProtonPassAfterLaunch: true]
    TryMount -->|Auth cancelled| Personal[PersonalProfileWorkflow]
    TryMount -->|Other failure| Exit2([exit 1])
    StdinMount -->|Other failure| Exit3([exit 1])

    SecureSkipPass --> Purge1[HostFootprint purge]
    SecureTouchID --> Purge2[HostFootprint purge]
    SecureKillPass --> Purge3[HostFootprint purge]
    Purge1 --> Eject1[DiskImage.detach]
    Purge2 --> Eject2[DiskImage.detach]
    Purge3 --> Eject3[DiskImage.detach]
    Personal --> Done([Success — no DMG to eject])

    Eject1 --> Success([printSuccess + exit 0])
    Eject2 --> Success
    Eject3 --> Success
```

---

## Secure Profile Session Lifecycle

Only the **secure profile** path activates `SecureZenSessionMonitor`. The personal profile opens Zen in fire-and-forget mode with no monitoring and no DMG eject.

```mermaid
sequenceDiagram
    participant Script
    participant Zen
    participant Monitor as SecureZenSessionMonitor
    participant Footprint as HostFootprint
    participant macOS

    Script->>Zen: open Zen.app --profile secureVolumeRoot
    Script->>Script: waitUntilLaunched
    Script->>Monitor: waitUntilSessionEnds
    Monitor->>Monitor: AppKitEventLoop.activate
    Monitor->>Monitor: register observers

    loop Every 0.25s RunLoop.default
        Monitor->>Monitor: poll ZenApp.isRunning
    end

    alt User quits Zen Cmd+Q
        macOS-->>Monitor: didTerminateApplicationNotification
        Monitor-->>Script: userQuitZen
    else Zen process gone polling fallback
        Monitor-->>Script: userQuitZen
    else Screen lock or sleep
        macOS-->>Monitor: screenIsLocked / willSleep
        Monitor->>Zen: ZenApp.forceTerminateAll
        Monitor-->>Script: systemLockOrSleep
    end

    Script->>Footprint: purgeZenHostCache + scrubZenProfilesIni
    Script->>Script: DiskImage.detach at mountPoint
    Script->>Script: workflow complete
```

---

## SecureZenSessionMonitor — Event Sources

```mermaid
flowchart LR
    subgraph triggers [Triggers vault teardown]
        Quit[Zen quit<br/>didTerminateApplicationNotification]
        Poll[ZenApp.isRunning false<br/>polling fallback]
        Lock[Screen lock<br/>CFNotificationCenter com.apple.screenIsLocked]
        Sleep[System sleep<br/>NSWorkspace.willSleepNotification]
    end

    subgraph actions [Actions]
        NormalStop[finish userQuitZen]
        SecurityStop[ZenApp.forceTerminateAll then finish systemLockOrSleep]
    end

    Quit --> NormalStop
    Poll --> NormalStop
    Lock --> SecurityStop
    Sleep --> SecurityStop

    NormalStop --> Purge[HostFootprint purge in SecureVaultWorkflow]
    SecurityStop --> Purge

    Purge --> Eject[DiskImage.detach in SecureVaultWorkflow]
```

| Event | API | On trigger |
|---|---|---|
| Zen quit | `NSWorkspace.didTerminateApplicationNotification` | Finish monitor (`userQuitZen`) |
| Zen gone (fallback) | `ZenApp.isRunning` poll every 0.25s | Finish monitor (`userQuitZen`) |
| Screen lock | `CFNotificationCenter` → `Zen.screenLockedNotification` | Force-terminate Zen → finish (`systemLockOrSleep`) |
| System sleep | `NSWorkspace.willSleepNotification` | Force-terminate Zen → finish (`systemLockOrSleep`) |

> **Note:** Security monitoring applies **only** when `ZenBrowserLauncher.Session.monitoredSecureVault` is used. Personal profile uses `.immediate` and skips the monitor entirely.

---

## Configuration

All paths are defined in `Paths` inside [`პროფილი.swift`](პროფილი.swift):

| Constant | Path | Purpose |
|---|---|---|
| `Paths.encryptedVault` | `~/Library/Application Support/zen/Profiles/Profile.dmg` | Encrypted vault image |
| `Paths.protonPassApp` | `/Applications/Proton Pass.app` | Password manager (fallback when Touch ID mount fails) |
| `Paths.zenApp` | `/Applications/Zen.app` | Zen Browser |
| `Paths.secureVolumeRoot` | `/Volumes/.com.apple.zen.framework` | Hidden fixed DMG mount point (profile at DMG root) |
| `Paths.secureProfile` | Same as `secureVolumeRoot` | Zen profile path passed to `--profile` |
| `Paths.personalProfile` | `~/Library/Application Support/zen/Profiles/zi76byi5.Pesonal` | Fallback unencrypted profile |
| `Paths.zenHostCache` | `~/Library/Caches/app.zen-browser.zen` | Host-side Zen cache purged after secure session |
| `Paths.zenProfilesIni` | `~/Library/Application Support/zen/profiles.ini` | Zen profile registry scrubbed after secure session |

Zen identifiers in `Zen`:

| Constant | Value |
|---|---|
| `zenBundleIdentifier` | `Zen.bundleIdentifier` (`app.zen-browser.zen`) |
| `zenProcessName` | `Zen.processName` (`Zen`) |

Keychain identifiers in `VaultCredentialStore`:

| Constant | Value |
|---|---|
| `VaultCredentialStore.service` | `com.johann.zen.secure-vault` |
| `VaultCredentialStore.account` | `Profile.dmg` |

---

## Behavior Reference

### 1. DMG already mounted

- Skips Proton Pass launch.
- Skips killing Proton Pass (`terminateProtonPassAfterLaunch: false`).
- Opens Zen with secure profile at `secureVolumeRoot`.
- Monitors session until quit, lock, or sleep.
- Purges host cache and scrubs `profiles.ini`.
- Ejects DMG when session ends (with detach retry).

### 2. Fresh mount — Touch ID happy path

1. Prompts Touch ID via `VaultCredentialStore.retrieveWithBiometrics`.
2. Retrieves DMG passphrase from Keychain (Touch ID protected; separate from Mac login password).
3. Runs `hdiutil attach -stdinpass -nobrowse -mountpoint /Volumes/.com.apple.zen.framework` — no Proton Pass, no manual password dialog.
4. Opens Zen with secure profile.
5. Monitors session.
6. Purges host cache and scrubs `profiles.ini`.
7. Ejects DMG when session ends (with detach retry).

### 3. Fresh mount — Proton Pass fallback

When Touch ID is cancelled, unavailable, not configured, or the stored passphrase fails:

1. Opens Proton Pass (if Zen is not already running).
2. Runs `hdiutil attach -nobrowse -mountpoint /Volumes/.com.apple.zen.framework` — macOS prompts for DMG password.
3. Kills Proton Pass after Zen opens (only if Proton Pass was opened in this fallback path).
4. Opens Zen with secure profile.
5. Monitors session.
6. Purges host cache and scrubs `profiles.ini`.
7. Ejects DMG when session ends (with detach retry).

### 4. Mount cancelled / wrong password

- Detects auth errors in `hdiutil` output (`Authentication_Canceled`, `cancelled`, etc.).
- Falls back to **personal profile** (no DMG, no monitoring, no eject).
- Opens Zen with `ZenBrowserLauncher.Session.immediate` and returns immediately.

### 5. Mount failure (non-auth)

- Prints error and calls `exit(1)`.

### 6. DMG file missing

- Prints error and calls `exit(1)` before any mount attempt.

### 7. Zen manual quit (secure session)

- `SecureZenSessionMonitor` detects quit via notification or polling.
- Prints `Zen Browser operation completed successfully.`
- Prints `Zen session ended. Purging host footprint...`
- Removes `~/Library/Caches/app.zen-browser.zen` and scrubs secure entries from `profiles.ini`.
- Prints `Ejecting vault...`
- Runs `hdiutil detach` (up to 3 attempts, 1s apart; `-force` fallback).

### 8. Screen lock or sleep (secure session)

- Monitor receives lock/sleep event.
- Prints `System sleep/lock detected — securing vault...`
- Force-terminates Zen via `NSRunningApplication.forceTerminate()` (falls back to `pkill -x Zen`).
- Prints `Vault secured due to system sleep or lock.`
- Purges host cache and scrubs `profiles.ini`.
- Ejects DMG (with detach retry).

### 9. Zen already running at start

- `ProtonPassApp.openWhenZenIsNotRunning` skips Proton Pass.
- `open` may focus the existing Zen instance instead of spawning a new one.

### 10. Personal profile fallback

- No `SecureZenSessionMonitor`.
- No DMG mount or eject.
- No host footprint purge (secure path never ran).
- Zen opens and script exits immediately.

### 11. Hidden mount point (OpSec)

- DMG mounts at `/Volumes/.com.apple.zen.framework` (dot-prefixed, hidden in Finder).
- `ps aux` shows a generic system-looking `--profile` path instead of `Profile Secure` / `j3wki3fc.Secure`.
- Profile files live at the DMG root (not in a subfolder).

### 12. One-time vault password setup (`--store-vault-password`)

Store the DMG encryption password in Keychain, protected by Touch ID:

```bash
pbpaste | ./პროფილი.swift --store-vault-password
```

Copy the vault password from Proton Pass first, then run the command above. The password is stored under `VaultCredentialStore.service` / `VaultCredentialStore.account` with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Touch ID is enforced on every read via `LAContext` (required for unsigned Raycast/CLI scripts — item-level `SecAccessControl` biometry needs code signing entitlements).

**Security notes:**

- Vault passphrase is separate from your Mac login password; Touch ID is required before each Keychain read.
- Uses the file-based Keychain (`kSecUseDataProtectionKeychain: false`) so the script can run without app entitlements.
- Item is device-only, not iCloud-synced.
- Proton Pass remains the recovery source of truth; fallback path is unchanged.

---

## Process Kill Strategy

```mermaid
flowchart TD
    KillZen[ZenApp.forceTerminateAll] --> FindApps[runningInstances by bundle ID]
    FindApps -->|None| DoneOK[Return true — not running]
    FindApps -->|Found| ForceTerm[forceTerminate on each]
    ForceTerm --> WaitLoop[Poll up to 5s]
    WaitLoop -->|Gone| DoneOK2[Return true]
    WaitLoop -->|Still running| Pkill[pkill -x Zen]
    Pkill -->|Gone| DoneOK3[Return true]
    Pkill -->|Still running| DoneFail[Return false]
```

---

## DMG Detach Strategy

```mermaid
flowchart TD
    DetachStart[DiskImage.detach] --> AttemptLoop[Attempt 1 to 3 hdiutil detach]
    AttemptLoop -->|Success| DoneOK[Return true]
    AttemptLoop -->|Fail| Wait1s[Sleep 1s then retry]
    Wait1s --> AttemptLoop
    AttemptLoop -->|All 3 failed| ForceDetach["hdiutil detach -force"]
    ForceDetach -->|Success| DoneForce[Return true]
    ForceDetach -->|Fail| DoneFail[Return false]
```

Handles "Resource busy" races when Zen releases file handles slowly after quit or force-terminate.

---

## Logging Conventions

| Prefix | Function | Meaning |
|---|---|---|
| 🔧 | `Log.status` | Informational step |
| ✅ | `Log.success` | Successful operation |
| ❌ | `Log.error` | Error (may or may not abort) |

Raycast `silent` mode surfaces this output in the Raycast log / terminal when run via CLI.

---

## Dependencies & Requirements

- **macOS** with `hdiutil`, `open`, `pkill`, `pgrep`
- **Zen Browser** at `/Applications/Zen.app`
- **Proton Pass** (optional fallback) at `/Applications/Proton Pass.app`
- **Encrypted DMG** at the configured `dmgPath`
- **AppKit** — imported for `NSWorkspace`, `NSRunningApplication`, run loop, and screen-lock notifications
- **LocalAuthentication** — Touch ID prompt for Keychain vault unlock
- **Security** — Keychain storage and retrieval of DMG passphrase
- **Touch ID** Mac (or skip to Proton Pass fallback on machines without biometry)
- Script must **remain running** for the full secure session (Raycast waits until the script exits)

### Run loop constraint

The monitor uses `RunLoop.main.run(mode: .default, before:)` — **not** `.common`. Using `.common` as a run mode causes a CFRunLoop error and breaks event delivery.

---

## Manual Testing Checklist

| Scenario | Expected result |
|---|---|
| One-time setup: `pbpaste \| ./პროფილი.swift --store-vault-password` | Vault password stored in Keychain (Touch ID protected), exits 0 |
| Touch ID mount happy path | Touch ID prompt → mount via `-stdinpass` → Zen secure profile, Proton Pass never opens |
| Cancel Touch ID | Proton Pass opens → manual password prompt → secure or personal profile |
| Wrong stored Keychain password | Keychain mount fails → Proton Pass fallback works |
| Mount DMG → use Zen → Cmd+Q | Host cache purged, profiles.ini scrubbed, DMG ejects, script exits successfully |
| Already-mounted DMG path | Skips Touch ID and Proton Pass, monitors, purges footprint, ejects on quit |
| Lock screen (⌃⌘Q) during secure session | Zen killed, footprint purged, DMG ejected |
| Close lid / sleep during secure session | Zen killed, footprint purged, DMG ejected |
| Cancel DMG password prompt | Personal profile opens, no purge, no eject |
| Missing DMG file | Script exits with code 1 |
| Quick Cmd+Q after browsing | Detach retry succeeds despite busy resource |
| After secure session | `~/Library/Caches/app.zen-browser.zen` removed; no `.com.apple.zen.framework` in profiles.ini |
| `ps aux` during secure session | Shows `/Volumes/.com.apple.zen.framework`, not `Profile Secure` |
| Run from CLI: `./პროფილი.swift` | Same behavior as Raycast |

---

## File Structure (code map)

```
პროფილი.swift
├── Paths / Zen / SystemPaths          — paths and identifiers
├── Log / FileSystem                   — logging and filesystem helpers
├── ProcessRunner                      — shell command execution
├── DiskImagePlist models              — hdiutil plist parsing
├── DiskImage                          — attach, detach, mount status
├── HostFootprint                      — cache purge + profiles.ini scrub
├── AppKitEventLoop                    — CLI notification bootstrap
├── VaultCredentialStore               — Touch ID Keychain store/retrieve
├── VaultCredentialSetup               — --store-vault-password CLI mode
├── ZenApp / ProtonPassApp             — process lifecycle
├── SecureZenSessionMonitor            — sleep / lock / quit monitoring
├── ZenBrowserLauncher                 — open Zen (monitored or immediate)
├── SecureVaultWorkflow                — secure profile + eject
├── PersonalProfileWorkflow            — fallback profile
└── ProfileLauncher                    — entry orchestrator
```

---

## Maintaining This Document

**Update [`პროფილი-README.md`](პროფილი-README.md) whenever you change [`პროფილი.swift`](პროფილი.swift).** Treat the README as part of the same change — do not merge script changes without updating the docs.

### When to update

| Change in script | Sections to update |
|---|---|
| New/removed path in `Paths` | Configuration table |
| New workflow branch in `ProfileLauncher` | Main Workflow Decision Tree diagram + Behavior Reference |
| New monitor event or removed observer | SecureZenSessionMonitor diagram + Event Sources table |
| Changed kill/eject/mount logic | Process Kill Strategy + relevant behavior item |
| New Raycast metadata comments | Overview table |
| Changed `ZenBrowserLauncher.Session` / profile logic | Secure Profile Session Lifecycle + Behavior Reference |
| New exit codes or error handling | Behavior Reference + Testing Checklist |
| Renamed functions or restructured MARK sections | File Structure code map |

### Update checklist

1. Read the full diff of `პროფილი.swift`.
2. Identify which behaviors, paths, or events changed.
3. Update the affected **diagrams** (mermaid blocks must use valid syntax: no spaces in node IDs, no HTML in labels).
4. Update the **tables** and **behavior list** to match the new logic exactly.
5. Add or remove **test scenarios** if behavior changed.
6. Verify diagrams still reflect the real call order (especially `SecureVaultWorkflow` → `ZenBrowserLauncher` → `SecureZenSessionMonitor` → `HostFootprint` → `DiskImage.detach`).

### Diagram rules used here

- `flowchart` for decision trees and architecture.
- `sequenceDiagram` for time-ordered secure session flow.
- Node IDs use camelCase without spaces (e.g. `CheckMounted`, not `Check Mounted`).
- Edge labels use `\n` for line breaks inside node text where needed.

### Quick validation after edits

```bash
# Typecheck the script
swiftc -typecheck პროფილი.swift \
  -framework AppKit -framework Foundation \
  -framework LocalAuthentication -framework Security

# One-time Keychain setup (copy password from Proton Pass first)
pbpaste | ./პროფილი.swift --store-vault-password

# Run manually and walk through the testing checklist above
./პროფილი.swift
```

If a diagram no longer matches a function name or flow in the source file, the README is out of date — fix it before considering the change complete.
