#!/usr/bin/swift

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Open Developer
// @raycast.mode silent

// Optional parameters:
// @raycast.icon icon.svg
// @raycast.packageName Utilities
// @raycast.needsConfirmation false

// Documentation:
// @raycast.description Open the Developer folder on terminal
// @raycast.author Johann-Goncalves-Pereira
// @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira

import AppKit
import Foundation
import IOKit.pwr_mgt
import LocalAuthentication
import Security

enum Paths {
    static let encryptedVault = NSString(string: "~/Library/Application Support/zen/Profiles/Profile.dmg").expandingTildeInPath
    /// Prefer the SIP-safe home copy (fx-autoconfig / PiP). Fall back to /Applications.
    static let zenApp: String = {
        let homeCopy = NSString(string: "~/Applications/Zen.app").expandingTildeInPath
        if FileManager.default.fileExists(atPath: homeCopy) {
            return homeCopy
        }
        return "/Applications/Zen.app"
    }()
    static let secureVolumeRoot = "/Volumes/.com.apple.zen.framework"
    static let secureProfile = secureVolumeRoot
    static let zenHostCache = "~/Library/Caches/app.zen-browser.zen"
    static let zenProfilesIni = "~/Library/Application Support/zen/profiles.ini"
    static let secureVaultSession = NSString(
        string: "~/Library/Application Support/zen/secure-vault-session.json"
    ).expandingTildeInPath
    static let launchAgentsDirectory = NSString(string: "~/Library/LaunchAgents").expandingTildeInPath
    static let sessionWatchdogLabel = "com.johann.zen.secure-vault-watchdog"
    static let orphanGuardLabel = "com.johann.zen.secure-vault-orphan-guard"
    static let sessionWatchdogPlist = launchAgentsDirectory + "/\(sessionWatchdogLabel).plist"
    static let orphanGuardPlist = launchAgentsDirectory + "/\(orphanGuardLabel).plist"
    static let watchdogLog = "/tmp/zen-secure-vault-watchdog.log"
    static let orphanGuardLog = "/tmp/zen-secure-vault-orphan-guard.log"
}

enum ScriptLocation {
    /// Absolute path to this script (Raycast / `swift script.swift` / LaunchAgent).
    static var path: String {
        let candidates = CommandLine.arguments.filter { $0.hasSuffix(".swift") }
        let raw = candidates.first ?? CommandLine.arguments[0]
        if raw.hasPrefix("/") {
            return raw
        }
        let cwd = FileManager.default.currentDirectoryPath
        return URL(fileURLWithPath: cwd).appendingPathComponent(raw).standardizedFileURL.path
    }
}

enum Zen {
    static let bundleIdentifier = "app.zen-browser.zen"
    static let screenLockedNotification = "com.apple.screenIsLocked"
}

enum SystemPaths {
    static let hdiutil = "/usr/bin/hdiutil"
    static let kill = "/usr/bin/kill"
    static let ps = "/bin/ps"
    static let lsof = "/usr/sbin/lsof"
    static let launchctl = "/bin/launchctl"
    static let swift = "/usr/bin/swift"
    static let volumesRoot = "/Volumes/"
}

enum Log {
    static func status(_ message: String) { print("🔧 \(message)") }
    static func error(_ message: String) { print("❌ \(message)") }
    static func success(_ message: String) { print("✅ \(message)") }
}

/// Desktop Notification Center alerts (avoids shadowing Foundation.Notification).
enum DesktopNotification {
    static func display(title: String, message: String) {
        let escapedTitle = escapeAppleScriptString(title)
        let escapedMessage = escapeAppleScriptString(message)
        let script = "display notification \"\(escapedMessage)\" with title \"\(escapedTitle)\""
        do {
            let (exitCode, output) = try ProcessRunner.capture(
                executable: "/usr/bin/osascript",
                arguments: ["-e", script]
            )
            if exitCode != 0 {
                Log.error("Desktop notification failed (status \(exitCode)): \(output)")
            }
        } catch {
            Log.error("Desktop notification failed: \(error)")
        }
    }

    private static func escapeAppleScriptString(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
    }
}

enum PowerManagement {
    private static var assertionID: IOPMAssertionID = 0
    private static var hasAssertion = false

    static func acquireSleepAssertion(reason: String = "Securing Zen encrypted vault before system sleep") {
        guard !hasAssertion else { return }
        let type = kIOPMAssertionTypePreventSystemSleep as CFString
        let level = IOPMAssertionLevel(kIOPMAssertionLevelOn)
        let result = IOPMAssertionCreateWithName(
            type,
            level,
            reason as CFString,
            &assertionID
        )
        if result == kIOReturnSuccess {
            hasAssertion = true
            Log.status("Power assertion acquired: preventing sleep until vault is secured")
        } else {
            Log.error("Failed to acquire sleep assertion (IOReturn \(result)); teardown may be interrupted by sleep")
        }
    }

    static func releaseSleepAssertion() {
        guard hasAssertion else { return }
        IOPMAssertionRelease(assertionID)
        hasAssertion = false
        assertionID = 0
        Log.status("Power assertion released")
    }
}

enum FileSystem {
    private static let manager = FileManager.default

    static func exists(at path: String) -> Bool {
        manager.fileExists(atPath: path)
    }

    static func expandingTilde(in path: String) -> String {
        NSString(string: path).expandingTildeInPath
    }
}

struct ProcessRunner {
    static func captureData(
        executable: String,
        arguments: [String],
        stdin: Data? = nil
    ) throws -> (exitCode: Int32, data: Data) {
        let task = Process()
        task.launchPath = executable
        task.arguments = arguments

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        if let stdin {
            let inputPipe = Pipe()
            task.standardInput = inputPipe
            try task.run()
            inputPipe.fileHandleForWriting.write(stdin)
            inputPipe.fileHandleForWriting.closeFile()
        } else {
            try task.run()
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()

        return (task.terminationStatus, data)
    }

    static func capture(
        executable: String,
        arguments: [String],
        stdin: Data? = nil
    ) throws -> (exitCode: Int32, output: String) {
        let (exitCode, data) = try captureData(executable: executable, arguments: arguments, stdin: stdin)
        let output = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return (exitCode, output)
    }

    static func run(executable: String, arguments: [String]) throws {
        _ = try capture(executable: executable, arguments: arguments)
    }
}

struct DiskImagePlist: Codable {
    let images: [MountedDiskImage]
}

struct MountedDiskImage: Codable {
    let imagePath: String
    let systemEntities: [DiskImageEntity]?

    enum CodingKeys: String, CodingKey {
        case imagePath = "image-path"
        case systemEntities = "system-entities"
    }
}

struct DiskImageEntity: Codable {
    let contentHint: String?
    let mountPoint: String?
    let volumeKind: String?

    enum CodingKeys: String, CodingKey {
        case contentHint = "content-hint"
        case mountPoint = "mount-point"
        case volumeKind = "volume-kind"
    }
}

enum DiskImage {
    static func volumeName(from dmgPath: String) -> String {
        URL(fileURLWithPath: dmgPath).deletingPathExtension().lastPathComponent
    }

    static func mountPoint(for imagePath: String) -> String? {
        guard FileSystem.exists(at: Paths.secureVolumeRoot) else { return nil }

        do {
            let (exitCode, data) = try ProcessRunner.captureData(
                executable: SystemPaths.hdiutil,
                arguments: ["info", "-plist"]
            )

            guard exitCode == 0,
                  let inventory = try? PropertyListDecoder().decode(DiskImagePlist.self, from: data)
            else { return nil }

            for image in inventory.images where image.imagePath == imagePath {
                for entity in image.systemEntities ?? [] {
                    if entity.mountPoint == Paths.secureVolumeRoot {
                        return Paths.secureVolumeRoot
                    }
                }
            }
        } catch {
            Log.error("Error getting hdiutil info: \(error)")
        }

        return nil
    }

    static func mountStatus(for dmgPath: String) -> (isMounted: Bool, mountPoint: String?) {
        guard FileSystem.exists(at: Paths.secureVolumeRoot) else {
            return (false, nil)
        }

        guard let mountPoint = mountPoint(for: dmgPath) else {
            return (false, nil)
        }

        return (true, mountPoint)
    }

    static func attach(_ dmgPath: String, passphrase: String? = nil) -> String? {
        Log.status("Attempting to mount \(dmgPath)...")

        if passphrase == nil {
            print("IMPORTANT: If the DMG is encrypted, macOS will now ask for the password.")
            print("This script cannot enter the password for you.")
        }

        var arguments = ["attach", dmgPath, "-nobrowse", "-mountpoint", Paths.secureVolumeRoot]
        var stdinData: Data?

        if let passphrase {
            arguments.append("-stdinpass")
            let trimmed = passphrase.trimmingCharacters(in: .whitespacesAndNewlines)
            var input = Data(trimmed.utf8)
            input.append(0)
            stdinData = input
        }

        do {
            let (exitCode, output) = try ProcessRunner.capture(
                executable: SystemPaths.hdiutil,
                arguments: arguments,
                stdin: stdinData
            )

            Log.status("hdiutil attach command finished.")
            Log.status("Termination Status: \(exitCode)")

            if !output.isEmpty {
                print("Output:\n\(output)")
            }

            guard exitCode == 0 else {
                return resolveMountFailure(output: output, exitCode: exitCode)
            }

            if FileSystem.exists(at: Paths.secureVolumeRoot) {
                Log.success("DMG mounted successfully at \(Paths.secureVolumeRoot)")
                return Paths.secureVolumeRoot
            }

            if let mountPoint = mountPoint(for: dmgPath) {
                Log.success("DMG mounted successfully at \(mountPoint)")
                return mountPoint
            }

            return parseMountPointFromAttachOutput(output)
        } catch {
            Log.error("Failed to execute hdiutil: \(error)")
            return nil
        }
    }

    /// Detaches only after secure Zen (and other holders) have released the volume.
    /// In urgent mode (e.g. system sleep), termination is immediate and unmount is expedited.
    static func detach(at mountPoint: String, urgent: Bool = false) -> Bool {
        // Idempotent: sleep fast-path may already have ejected before workflow cleanup runs.
        if !FileSystem.exists(at: mountPoint) {
            Log.success("Vault already unmounted at \(mountPoint)")
            return true
        }

        _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: urgent)
        let idleTimeout: TimeInterval = urgent ? 1.0 : 4.0
        _ = waitUntilMountIdle(mountPoint, timeout: idleTimeout)

        let maxAttempts = urgent ? 2 : 5
        for attempt in 1...maxAttempts {
            Log.status("Detach attempt \(attempt)/\(maxAttempts) at \(mountPoint)...")

            if ZenApp.isSecureProfileInUse() {
                Log.status("Secure Zen still holds the vault — terminating again before detach...")
                _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: urgent)
                if !urgent { Thread.sleep(forTimeInterval: 0.5) }
            }

            do {
                let (exitCode, output) = try ProcessRunner.capture(
                    executable: SystemPaths.hdiutil,
                    arguments: ["detach", mountPoint]
                )

                if exitCode == 0 {
                    Log.success("Successfully ejected \(mountPoint). Output: \(output)")
                    return true
                }

                Log.error("Error ejecting DMG \(mountPoint). Status: \(exitCode). Output: \(output)")

                if attempt < maxAttempts {
                    let delay: TimeInterval = urgent ? 0.2 : 1.0
                    Log.status("Retrying detach in \(delay)s (resource may still be busy)...")
                    Thread.sleep(forTimeInterval: delay)
                }
            } catch {
                Log.error("Failed to run eject command for \(mountPoint): \(error)")

                if attempt < maxAttempts {
                    let delay: TimeInterval = urgent ? 0.2 : 1.0
                    Thread.sleep(forTimeInterval: delay)
                }
            }
        }

        // Clean up any remaining Zen processes before forced detach
        _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: true)
        _ = waitUntilMountIdle(mountPoint, timeout: 0.5)

        Log.status("Attempting forced detach for \(mountPoint)...")

        do {
            let (exitCode, output) = try ProcessRunner.capture(
                executable: SystemPaths.hdiutil,
                arguments: ["detach", mountPoint, "-force"]
            )

            if exitCode == 0 {
                Log.success("Successfully force-ejected \(mountPoint). Output: \(output)")
                return true
            }

            Log.error("Forced detach failed for \(mountPoint). Status: \(exitCode). Output: \(output)")
            return false
        } catch {
            Log.error("Failed to run forced eject command for \(mountPoint): \(error)")
            return false
        }
    }

    private static func mountHasOpenFiles(_ mountPoint: String) -> Bool {
        do {
            let (exitCode, output) = try ProcessRunner.capture(
                executable: SystemPaths.lsof,
                arguments: ["-t", mountPoint]
            )
            // lsof exits 1 when nothing is open — that is success for us.
            if exitCode != 0 { return false }
            return !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        } catch {
            return false
        }
    }

    private static func waitUntilMountIdle(_ mountPoint: String, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            if !ZenApp.isSecureProfileInUse() && !mountHasOpenFiles(mountPoint) {
                return true
            }
            Thread.sleep(forTimeInterval: 0.1)
        }

        return !ZenApp.isSecureProfileInUse() && !mountHasOpenFiles(mountPoint)
    }

    private static func parseMountPointFromAttachOutput(_ output: String) -> String? {
        for line in output.components(separatedBy: .newlines) {
            let parts = line.split(separator: "\t")
            guard parts.count >= 3, let last = parts.last else { continue }
            guard last.hasPrefix(SystemPaths.volumesRoot) else { continue }

            let mountPoint = String(last)
            guard mountPoint == Paths.secureVolumeRoot else { continue }

            Log.success("DMG mounted successfully. Determined mount point: \(mountPoint)")
            return mountPoint
        }

        if FileSystem.exists(at: Paths.secureVolumeRoot) {
            Log.success("DMG mounted successfully at \(Paths.secureVolumeRoot)")
            return Paths.secureVolumeRoot
        }

        Log.error("DMG attach seemed to succeed but could not determine mount point.")
        print("Please check if a password prompt appeared and was handled correctly.")
        return nil
    }

    private static func isAuthenticationFailure(_ output: String) -> Bool {
        let lowered = output.lowercased()
        let markers = [
            "authentication_canceled",
            "authentication error",
            "attach canceled",
            "attach cancelled",
            "hdiutil: attach canceled",
            "incorrect password"
        ]
        return markers.contains(where: lowered.contains)
    }

    private static func resolveMountFailure(
        output: String,
        exitCode: Int32
    ) -> String? {
        Log.error("Error mounting DMG. hdiutil exited with status \(exitCode).")

        if isAuthenticationFailure(output) {
            Log.error("Mounting failed due to password prompt cancellation or incorrect password.")
            return nil
        }

        Log.error("DMG mounting failed for other reasons.")
        exit(1)
    }
}

enum HostFootprint {
    private static let securePathMarker = ".com.apple.zen.framework"
    private static let personalProfileFolder = "zi76byi5.Pesonal"

    private struct IniSection {
        let header: String
        var lines: [String]

        var pathValue: String? {
            lines.first { $0.hasPrefix("Path=") }.map { String($0.dropFirst(5)) }
        }

        var isDefault: Bool {
            lines.contains { $0.trimmingCharacters(in: .whitespaces) == "Default=1" }
        }

        func referencesSecureVolume() -> Bool {
            guard let path = pathValue else { return false }
            return path == Paths.secureVolumeRoot || path.contains(securePathMarker)
        }
    }

    static func purgeZenHostCache() {
        let path = FileSystem.expandingTilde(in: Paths.zenHostCache)
        try? FileManager.default.removeItem(atPath: path)
    }

    static func scrubZenProfilesIni() {
        let path = FileSystem.expandingTilde(in: Paths.zenProfilesIni)
        guard FileSystem.exists(at: path),
              let content = try? String(contentsOfFile: path, encoding: .utf8)
        else { return }

        var sections = parseSections(from: content)
        let removedHadDefault = sections.contains { $0.referencesSecureVolume() && $0.isDefault }
        let originalCount = sections.count
        sections.removeAll { $0.referencesSecureVolume() }

        guard sections.count < originalCount else { return }

        if removedHadDefault {
            reassignDefault(in: &sections)
        }

        let updated = serializeSections(sections)
        try? updated.write(toFile: path, atomically: true, encoding: .utf8)
        Log.status("Removed secure profile references from profiles.ini")
    }

    private static func parseSections(from content: String) -> [IniSection] {
        var sections: [IniSection] = []
        var currentHeader: String?
        var currentLines: [String] = []

        for line in content.components(separatedBy: .newlines) {
            if line.hasPrefix("[") && line.hasSuffix("]") {
                if let header = currentHeader {
                    sections.append(IniSection(header: header, lines: currentLines))
                }
                currentHeader = line
                currentLines = []
            } else if currentHeader != nil {
                currentLines.append(line)
            }
        }

        if let header = currentHeader {
            sections.append(IniSection(header: header, lines: currentLines))
        }

        return sections
    }

    private static func serializeSections(_ sections: [IniSection]) -> String {
        sections.map { section in
            ([section.header] + section.lines).joined(separator: "\n")
        }.joined(separator: "\n") + "\n"
    }

    private static func reassignDefault(in sections: inout [IniSection]) {
        for index in sections.indices {
            sections[index].lines.removeAll { $0.trimmingCharacters(in: .whitespaces) == "Default=1" }
        }

        if let personalIndex = sections.firstIndex(where: {
            $0.header.hasPrefix("[Profile") && ($0.pathValue?.contains(personalProfileFolder) == true)
        }) {
            sections[personalIndex].lines.append("Default=1")
        } else if let firstProfileIndex = sections.firstIndex(where: { $0.header.hasPrefix("[Profile") }) {
            sections[firstProfileIndex].lines.append("Default=1")
        }
    }
}

enum AppKitEventLoop {
    static func activate() {
        NSApplication.shared.setActivationPolicy(.accessory)
    }
}

struct VaultSessionState: Codable {
    var securePid: pid_t
    var mountPoint: String
    var createdAt: Date

    static func load() -> VaultSessionState? {
        let url = URL(fileURLWithPath: Paths.secureVaultSession)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(VaultSessionState.self, from: data)
    }

    static func save(securePid: pid_t, mountPoint: String) -> Bool {
        let state = VaultSessionState(securePid: securePid, mountPoint: mountPoint, createdAt: Date())
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        do {
            let directory = URL(fileURLWithPath: Paths.secureVaultSession).deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try encoder.encode(state)
            try data.write(to: URL(fileURLWithPath: Paths.secureVaultSession), options: .atomic)
            return true
        } catch {
            Log.error("Failed to write vault session file: \(error)")
            return false
        }
    }

    static func remove() {
        try? FileManager.default.removeItem(atPath: Paths.secureVaultSession)
    }
}

enum VaultLaunchAgent {
    private static var guiDomain: String {
        "gui/\(getuid())"
    }

    static func isLoaded(label: String) -> Bool {
        do {
            let (exitCode, _) = try ProcessRunner.capture(
                executable: SystemPaths.launchctl,
                arguments: ["print", "\(guiDomain)/\(label)"]
            )
            return exitCode == 0
        } catch {
            return false
        }
    }

    static func isSessionWatchdogLoaded() -> Bool {
        isLoaded(label: Paths.sessionWatchdogLabel)
    }

    static func isOrphanGuardLoaded() -> Bool {
        isLoaded(label: Paths.orphanGuardLabel)
    }

    static func bootout(label: String) {
        do {
            _ = try ProcessRunner.capture(
                executable: SystemPaths.launchctl,
                arguments: ["bootout", "\(guiDomain)/\(label)"]
            )
        } catch {
            // Already unloaded is fine.
        }
    }

    static func bootoutSessionWatchdog() {
        bootout(label: Paths.sessionWatchdogLabel)
    }

    static func writePlist(
        label: String,
        destination: String,
        modeArgument: String,
        keepAlive: Bool,
        logPath: String
    ) -> Bool {
        let keepAliveXML = keepAlive
            ? "  <key>KeepAlive</key>\n  <true/>\n"
            : ""
        let scriptPath = ScriptLocation.path
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key>
          <string>\(label)</string>
          <key>ProgramArguments</key>
          <array>
            <string>\(SystemPaths.swift)</string>
            <string>\(scriptPath)</string>
            <string>\(modeArgument)</string>
          </array>
        \(keepAliveXML)  <key>RunAtLoad</key>
          <true/>
          <key>StandardOutPath</key>
          <string>\(logPath)</string>
          <key>StandardErrorPath</key>
          <string>\(logPath)</string>
        </dict>
        </plist>
        """

        do {
            try FileManager.default.createDirectory(
                atPath: Paths.launchAgentsDirectory,
                withIntermediateDirectories: true
            )
            try plist.write(toFile: destination, atomically: true, encoding: .utf8)
            return true
        } catch {
            Log.error("Failed to write LaunchAgent plist \(destination): \(error)")
            return false
        }
    }

    static func bootstrap(plistPath: String, label: String) -> Bool {
        bootout(label: label)
        do {
            let (exitCode, output) = try ProcessRunner.capture(
                executable: SystemPaths.launchctl,
                arguments: ["bootstrap", guiDomain, plistPath]
            )
            if exitCode != 0 {
                Log.error("launchctl bootstrap \(label) failed (\(exitCode)): \(output)")
                return false
            }
            Log.status("LaunchAgent bootstrapped: \(label)")
            return true
        } catch {
            Log.error("launchctl bootstrap \(label) error: \(error)")
            return false
        }
    }

    static func ensureOrphanGuardInstalled() -> Bool {
        guard writePlist(
            label: Paths.orphanGuardLabel,
            destination: Paths.orphanGuardPlist,
            modeArgument: "--orphan-guard",
            keepAlive: true,
            logPath: Paths.orphanGuardLog
        ) else {
            return false
        }

        if isOrphanGuardLoaded() {
            return true
        }

        return bootstrap(plistPath: Paths.orphanGuardPlist, label: Paths.orphanGuardLabel)
    }

    static func startSessionWatchdog() -> Bool {
        guard writePlist(
            label: Paths.sessionWatchdogLabel,
            destination: Paths.sessionWatchdogPlist,
            modeArgument: "--watchdog",
            keepAlive: false,
            logPath: Paths.watchdogLog
        ) else {
            return false
        }
        return bootstrap(plistPath: Paths.sessionWatchdogPlist, label: Paths.sessionWatchdogLabel)
    }
}

enum VaultWatchdog {
    private static let handoffGraceSeconds: TimeInterval = 15

    static func handoff(securePid: pid_t, mountPoint: String) -> Bool {
        guard VaultSessionState.save(securePid: securePid, mountPoint: mountPoint) else {
            return false
        }

        guard VaultLaunchAgent.ensureOrphanGuardInstalled() else {
            Log.error("Failed to install orphan-guard LaunchAgent")
            VaultSessionState.remove()
            return false
        }

        guard VaultLaunchAgent.startSessionWatchdog() else {
            Log.error("Failed to start session watchdog LaunchAgent")
            VaultSessionState.remove()
            return false
        }

        Log.success("Watchdog handoff complete (PID \(securePid), mount \(mountPoint))")
        return true
    }

    /// Mount present with no live session agent (after handoff grace).
    static func shouldSecureOrphan() -> Bool {
        guard FileSystem.exists(at: Paths.secureVolumeRoot) else { return false }
        if VaultLaunchAgent.isSessionWatchdogLoaded() { return false }

        guard let session = VaultSessionState.load() else {
            return true
        }

        if Date().timeIntervalSince(session.createdAt) < handoffGraceSeconds {
            return false
        }

        return true
    }

    static func secureOrphanVault(reason: String) {
        PowerManagement.acquireSleepAssertion()
        defer { PowerManagement.releaseSleepAssertion() }

        Log.status("Orphan vault secure (\(reason)) — urgent terminate + eject")
        _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: true)
        _ = ZenApp.waitUntilSecureProfileGone(timeout: 2)
        HostFootprint.purgeZenHostCache()
        HostFootprint.scrubZenProfilesIni()

        if DiskImage.detach(at: Paths.secureVolumeRoot, urgent: true) {
            DesktopNotification.display(
                title: "Zen Browser",
                message: "🔒 Orphaned encrypted profile secured and ejected."
            )
            Log.success("Orphan vault ejected")
        } else {
            DesktopNotification.display(
                title: "Zen Browser",
                message: "❌ Warning: Orphaned encrypted profile still mounted!"
            )
            Log.error("Orphan vault eject failed")
        }

        VaultSessionState.remove()
    }

    static func finishSession(
        mountPoint: String,
        endReason: SecureSessionEnd,
        didUrgentEject: Bool
    ) {
        let isUrgent = endReason == .systemLockOrSleep
        if didUrgentEject {
            Log.status("Sleep/lock fast-path already ejected vault; verifying host state...")
        }

        Log.status("Zen session ended. Ensuring vault is released before eject...")
        _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: isUrgent)
        let goneTimeout: TimeInterval = isUrgent ? 2 : 8
        _ = ZenApp.waitUntilSecureProfileGone(timeout: goneTimeout)

        Log.status("Zen session ended. Purging host footprint...")
        HostFootprint.purgeZenHostCache()
        HostFootprint.scrubZenProfilesIni()

        Log.status("Ejecting vault...")
        if !DiskImage.detach(at: mountPoint, urgent: isUrgent) {
            Log.error("Failed to eject DMG properly")
            DesktopNotification.display(
                title: "Zen Browser",
                message: "❌ Warning: Failed to eject encrypted profile. Vault is still mounted!"
            )
        } else {
            DesktopNotification.display(
                title: "Zen Browser",
                message: "🔒 Encrypted profile secured and ejected."
            )
        }

        VaultSessionState.remove()
        PowerManagement.releaseSleepAssertion()
    }

    static func runWatchdog() {
        AppKitEventLoop.activate()

        if shouldSecureOrphan() {
            secureOrphanVault(reason: "watchdog start")
            VaultLaunchAgent.bootoutSessionWatchdog()
            exit(0)
        }

        guard let session = VaultSessionState.load() else {
            Log.status("Watchdog: no session file — nothing to monitor")
            VaultLaunchAgent.bootoutSessionWatchdog()
            exit(0)
        }

        guard FileSystem.exists(at: session.mountPoint) else {
            Log.status("Watchdog: session mount missing — clearing session")
            VaultSessionState.remove()
            VaultLaunchAgent.bootoutSessionWatchdog()
            exit(0)
        }

        Log.status("Watchdog monitoring secure PID \(session.securePid) at \(session.mountPoint)")
        let monitor = SecureZenSessionMonitor(securePid: session.securePid, mountPoint: session.mountPoint)
        let endReason = monitor.waitUntilSessionEnds()

        switch endReason {
        case .userQuitZen:
            Log.success("Zen Browser operation completed successfully.")
        case .systemLockOrSleep:
            Log.success("Vault secured due to system sleep or lock.")
        }

        finishSession(
            mountPoint: session.mountPoint,
            endReason: endReason,
            didUrgentEject: monitor.didUrgentEject
        )
        VaultLaunchAgent.bootoutSessionWatchdog()
        exit(0)
    }

    static func runOrphanGuard() {
        AppKitEventLoop.activate()
        Log.status("Orphan guard started")

        if shouldSecureOrphan() {
            secureOrphanVault(reason: "orphan-guard start")
        }

        let token = Unmanaged.passRetained(OrphanGuardCallbacks()).toOpaque()

        let center = NSWorkspace.shared.notificationCenter
        _ = center.addObserver(
            forName: NSWorkspace.willSleepNotification,
            object: nil,
            queue: .main
        ) { _ in
            if shouldSecureOrphan() {
                secureOrphanVault(reason: "orphan-guard sleep")
            }
        }
        _ = center.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { _ in
            if shouldSecureOrphan() {
                secureOrphanVault(reason: "orphan-guard wake")
            }
        }

        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDistributedCenter(),
            token,
            { _, _, _, _, _ in
                DispatchQueue.main.async {
                    if VaultWatchdog.shouldSecureOrphan() {
                        VaultWatchdog.secureOrphanVault(reason: "orphan-guard lock")
                    }
                }
            },
            Zen.screenLockedNotification as CFString,
            nil,
            .deliverImmediately
        )

        var lastPoll = Date.distantPast
        while true {
            RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 0.5))
            let now = Date()
            if now.timeIntervalSince(lastPoll) >= 5 {
                lastPoll = now
                if shouldSecureOrphan() {
                    secureOrphanVault(reason: "orphan-guard poll")
                }
            }
        }
    }

    /// Retained token holder for CFNotificationCenter orphan-guard observer.
    private final class OrphanGuardCallbacks {}
}

enum VaultCredentialStore {
    static let service = "com.johann.zen.secure-vault"
    static let account = "Profile.dmg"

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: kCFBooleanFalse as Any
        ]
    }

    private static func authenticateWithBiometrics(reason: String) -> Bool {
        AppKitEventLoop.activate()

        let context = LAContext()
        context.localizedFallbackTitle = ""

        var biometryError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometryError) else {
            return false
        }

        var success = false
        let semaphore = DispatchSemaphore(value: 0)

        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, _ in
            success = ok
            semaphore.signal()
        }

        while semaphore.wait(timeout: .now()) == .timedOut {
            RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
        }

        return success
    }

    static func storePassword(_ password: String) -> Bool {
        guard let passwordData = password.data(using: .utf8) else {
            Log.error("Invalid vault password encoding")
            return false
        }

        let base = baseQuery()
        SecItemDelete(base as CFDictionary)

        var addQuery = base
        addQuery[kSecValueData as String] = passwordData
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

        let status = SecItemAdd(addQuery as CFDictionary, nil)

        if status == errSecSuccess {
            Log.success("Vault password stored in Keychain (Touch ID required to read)")
            return true
        }

        Log.error("Failed to store vault password in Keychain (status \(status))")
        return false
    }

    static func retrieveWithBiometrics() -> String? {
        guard authenticateWithBiometrics(reason: "Unlock secure vault") else {
            if LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) {
                Log.status("Touch ID cancelled or failed")
            } else {
                Log.status("Touch ID unavailable — skipping Keychain vault unlock")
            }
            return nil
        }

        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            guard let data = result as? Data,
                  let password = String(data: data, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                  !password.isEmpty
            else {
                Log.error("Keychain returned invalid vault password data")
                return nil
            }
            return password
        case errSecItemNotFound:
            Log.status("Vault password not configured in Keychain — run --store-vault-password")
            return nil
        default:
            Log.status("Keychain vault unlock failed (status \(status))")
            return nil
        }
    }
}

enum VaultCredentialSetup {
    static func run() {
        Log.status("Reading vault password from stdin...")

        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard let password = String(data: input, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !password.isEmpty
        else {
            Log.error("No password provided on stdin")
            exit(1)
        }

        if VaultCredentialStore.storePassword(password) {
            exit(0)
        }

        exit(1)
    }
}

enum ZenApp {
    static func runningApplication(pid: pid_t) -> NSRunningApplication? {
        guard let app = NSRunningApplication(processIdentifier: pid),
              !app.isTerminated
        else { return nil }
        return app
    }

    static func isRunning(pid: pid_t) -> Bool {
        runningApplication(pid: pid) != nil
    }

    /// True when the frontmost app is a process holding the encrypted vault profile.
    static func isSecureProfileFrontmost() -> Bool {
        guard let front = NSWorkspace.shared.frontmostApplication else { return false }
        return pidsUsingSecureProfile().contains(front.processIdentifier)
    }

    /// PIDs whose argv references the secure vault profile (main + helpers).
    static func pidsUsingSecureProfile() -> [pid_t] {
        pidsWhoseCommandContains(Paths.secureProfile)
    }

    static func isSecureProfileInUse() -> Bool {
        !pidsUsingSecureProfile().isEmpty
    }

    static func waitUntilSecureProfileInUse(timeout: TimeInterval = 15) -> pid_t? {
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            if let pid = pidsUsingSecureProfile().first {
                return pid
            }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
        }

        return pidsUsingSecureProfile().first
    }

    static func waitUntilSecureProfileGone(timeout: TimeInterval = 10) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            if !isSecureProfileInUse() { return true }
            Thread.sleep(forTimeInterval: 0.2)
        }

        return !isSecureProfileInUse()
    }

    static func pidsHoldingMount(_ mountPoint: String) -> [pid_t] {
        do {
            let (exitCode, output) = try ProcessRunner.capture(
                executable: SystemPaths.lsof,
                arguments: ["-t", mountPoint]
            )
            guard exitCode == 0 else { return [] }
            return output
                .components(separatedBy: .newlines)
                .compactMap { line -> pid_t? in
                    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                    return pid_t(trimmed)
                }
        } catch {
            return []
        }
    }

    static func isZenProcess(pid: pid_t) -> Bool {
        if let app = NSRunningApplication(processIdentifier: pid),
           app.bundleIdentifier == Zen.bundleIdentifier {
            return true
        }
        do {
            let (_, output) = try ProcessRunner.capture(
                executable: SystemPaths.ps,
                arguments: ["-p", "\(pid)", "-o", "command="]
            )
            let lower = output.lowercased()
            return lower.contains("zen.app") || lower.contains("macos/zen") || lower.contains("plugin-container")
        } catch {
            return false
        }
    }

    /// Terminates every process using the secure profile path — not daily Zen.
    static func terminateProcessesUsingSecureProfile(urgent: Bool = false) -> Bool {
        var pids = Set(pidsUsingSecureProfile())
        pids.formUnion(pidsHoldingMount(Paths.secureVolumeRoot).filter { isZenProcess(pid: $0) })

        if pids.isEmpty {
            Log.status("No secure Zen processes holding the vault")
            return true
        }

        Log.status("Terminating secure Zen PIDs (urgent=\(urgent)): \(pids.sorted().map(String.init).joined(separator: ", "))")

        for pid in pids {
            runningApplication(pid: pid)?.forceTerminate()
            kill(pid, urgent ? SIGKILL : SIGTERM)
        }

        if !urgent {
            for _ in 0..<15 {
                pids = Set(pidsUsingSecureProfile())
                pids.formUnion(pidsHoldingMount(Paths.secureVolumeRoot).filter { isZenProcess(pid: $0) })
                if pids.isEmpty {
                    Log.success("Secure Zen processes released the vault")
                    return true
                }
                Thread.sleep(forTimeInterval: 0.1)
            }
        }

        pids = Set(pidsUsingSecureProfile())
        pids.formUnion(pidsHoldingMount(Paths.secureVolumeRoot).filter { isZenProcess(pid: $0) })
        for pid in pids {
            kill(pid, SIGKILL)
        }

        let waitTimeout: TimeInterval = urgent ? 1.0 : 3.0
        if waitUntilSecureProfileGone(timeout: waitTimeout) {
            Log.success("Secure Zen processes released the vault")
            return true
        }

        Log.error("Secure Zen processes still holding the vault: \(pidsUsingSecureProfile())")
        return false
    }

    /// Opens a new Zen instance and returns a PID that actually uses the secure profile path.
    static func openNewInstance(profilePath: String?, timeout: TimeInterval = 15) -> pid_t? {
        let before = Set(pidsUsingSecureProfile())
        let appURL = URL(fileURLWithPath: Paths.zenApp)
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        configuration.activates = true

        var arguments = ["-no-remote"]
        if let profilePath {
            arguments.append(contentsOf: ["--profile", profilePath])
        }
        configuration.arguments = arguments

        var launchedApp: NSRunningApplication?
        var launchError: Error?
        var didComplete = false

        NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { app, error in
            launchedApp = app
            launchError = error
            didComplete = true
        }

        let deadline = Date().addingTimeInterval(timeout)
        while !didComplete && Date() < deadline {
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        }

        if let launchError {
            Log.error("Failed to open Zen Browser: \(launchError.localizedDescription)")
            return nil
        }

        guard launchedApp != nil else {
            Log.error("Zen Browser did not return a running application.")
            return nil
        }

        // Prefer a PID whose argv contains the vault path — NSWorkspace's PID can be a short-lived stub.
        while Date() < deadline {
            let after = Set(pidsUsingSecureProfile())
            let newcomers = after.subtracting(before)
            if let pid = newcomers.sorted().first ?? after.sorted().first {
                return pid
            }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
        }

        if let fallback = launchedApp?.processIdentifier, isRunning(pid: fallback) {
            Log.status("Falling back to NSWorkspace PID \(fallback) (profile path not yet visible in ps)")
            return fallback
        }

        Log.error("Secure Zen process did not appear with profile path within the expected time.")
        return nil
    }

    private static func pidsWhoseCommandContains(_ marker: String) -> [pid_t] {
        do {
            let (_, output) = try ProcessRunner.capture(
                executable: SystemPaths.ps,
                arguments: ["-axo", "pid=,args="]
            )

            return output
                .components(separatedBy: .newlines)
                .compactMap { line -> pid_t? in
                    let trimmed = line.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty, trimmed.contains(marker) else { return nil }

                    let parts = trimmed.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
                    guard let first = parts.first, let pid = pid_t(first) else { return nil }
                    return pid
                }
        } catch {
            Log.error("Failed to list processes: \(error)")
            return []
        }
    }
}

enum SecureSessionEnd {
    case userQuitZen
    case systemLockOrSleep
}

/// Drops ActivityWatch *window* events for encrypted Zen while it is frontmost.
/// Daily Zen and every other app keep recording; AW does not need to be paused.
enum ActivityWatchPrivacy {
    private static let lookbackSeconds: TimeInterval = 5
    private static let requestTimeout: TimeInterval = 1.5

    private static var baseURLString: String {
        if let env = ProcessInfo.processInfo.environment["ACTIVITYWATCH_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !env.isEmpty
        {
            return env.hasSuffix("/") ? String(env.dropLast()) : env
        }
        return "http://127.0.0.1:5600"
    }

    private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// - Parameter notAfter: When set (trailing scrub after leaving encrypted Zen),
    ///   only delete events whose timestamp is at or before this instant so the first
    ///   seconds of daily Zen are not removed.
    static func scrubEncryptedZenWindowEvents(notAfter: Date? = nil) {
        guard let buckets = localWindowBucketIDs() else { return }

        let startDate = Date().addingTimeInterval(-lookbackSeconds)
        let startParam = isoFractional.string(from: startDate)

        for bucketID in buckets {
            guard let events = fetchEvents(bucketID: bucketID, start: startParam) else { continue }
            for event in events where isEncryptedZenWindowEvent(event) {
                if let notAfter, event.timestamp > notAfter {
                    continue
                }
                deleteEvent(bucketID: bucketID, eventID: event.id)
            }
        }
    }

    private static func isEncryptedZenWindowEvent(_ event: AWEvent) -> Bool {
        event.appName.compare("Zen", options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
    }

    private static func localWindowBucketIDs() -> [String]? {
        guard let url = URL(string: "\(baseURLString)/api/0/buckets/"),
              let data = httpData(url: url, method: "GET"),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return nil
        }

        return json.keys.filter { key in
            key.hasPrefix("aw-watcher-window_") && !key.contains("synced")
        }.sorted()
    }

    private static func fetchEvents(bucketID: String, start: String) -> [AWEvent]? {
        var components = URLComponents(string: "\(baseURLString)/api/0/buckets/\(bucketID)/events")
        components?.queryItems = [
            URLQueryItem(name: "start", value: start),
            URLQueryItem(name: "limit", value: "100")
        ]
        guard let url = components?.url,
              let data = httpData(url: url, method: "GET"),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else {
            return nil
        }

        return raw.compactMap { AWEvent(json: $0) }
    }

    private static func deleteEvent(bucketID: String, eventID: Int) {
        guard let url = URL(string: "\(baseURLString)/api/0/buckets/\(bucketID)/events/\(eventID)") else {
            return
        }
        _ = httpData(url: url, method: "DELETE")
    }

    private static func httpData(url: URL, method: String) -> Data? {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = requestTimeout

        let semaphore = DispatchSemaphore(value: 0)
        var result: Data?
        let task = URLSession.shared.dataTask(with: request) { data, response, _ in
            defer { semaphore.signal() }
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode)
            else { return }
            result = data ?? Data()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + requestTimeout + 0.5)
        return result
    }

    private struct AWEvent {
        let id: Int
        let appName: String
        let timestamp: Date

        init?(json: [String: Any]) {
            guard let id = json["id"] as? Int else { return nil }
            let data = json["data"] as? [String: Any]
            let app = (data?["app"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let timestamp: Date
            if let raw = json["timestamp"] as? String {
                if let parsed = ActivityWatchPrivacy.isoFractional.date(from: raw)
                    ?? ISO8601DateFormatter().date(from: raw)
                {
                    timestamp = parsed
                } else {
                    timestamp = Date()
                }
            } else {
                timestamp = Date()
            }
            self.id = id
            self.appName = app
            self.timestamp = timestamp
        }
    }
}

final class ActivityWatchEncryptedZenFilter {
    private let queue = DispatchQueue(label: "com.johann.zen.aw-privacy")
    private var secureFrontmostUntil: Date?
    private var lastScheduleAt = Date.distantPast
    private var didAnnounce = false
    private let minInterval: TimeInterval = 1.0

    func tick() {
        let secureFrontmost = ZenApp.isSecureProfileFrontmost()
        let now = Date()
        guard now.timeIntervalSince(lastScheduleAt) >= minInterval else { return }

        if secureFrontmost {
            if !didAnnounce {
                Log.status("ActivityWatch: scrubbing encrypted Zen window events (other apps + daily Zen still record)")
                didAnnounce = true
            }
            scheduleScrub(notAfter: nil)
            secureFrontmostUntil = now
            lastScheduleAt = now
        } else if let until = secureFrontmostUntil {
            // Catch the last heartbeat, but do not erase daily Zen that started after leave.
            scheduleScrub(notAfter: until.addingTimeInterval(1.5))
            secureFrontmostUntil = nil
            lastScheduleAt = now
        }
    }

    func flush() {
        if let until = secureFrontmostUntil {
            scheduleScrub(notAfter: until.addingTimeInterval(1.5))
            secureFrontmostUntil = nil
        } else {
            scheduleScrub(notAfter: Date().addingTimeInterval(1.5))
        }
        // Allow in-flight HTTP to finish before vault teardown continues.
        queue.sync {}
    }

    private func scheduleScrub(notAfter: Date?) {
        queue.async {
            ActivityWatchPrivacy.scrubEncryptedZenWindowEvents(notAfter: notAfter)
        }
    }
}

final class SecureZenSessionMonitor {
    /// Seed PID from launch; session liveness is profile-path based (main + helpers).
    private let securePid: pid_t
    private let mountPoint: String
    private var workspaceObservers: [NSObjectProtocol] = []
    private var screenLockObserverToken: UnsafeMutableRawPointer?
    private var hasFinished = false
    private var endReason: SecureSessionEnd = .userQuitZen
    private let activityWatchFilter = ActivityWatchEncryptedZenFilter()
    private var mainPidExitedAt: Date?
    /// True when sleep/lock already performed urgent detach under the power assertion.
    private(set) var didUrgentEject = false

    init(securePid: pid_t, mountPoint: String) {
        self.securePid = securePid
        self.mountPoint = mountPoint
    }

    func waitUntilSessionEnds() -> SecureSessionEnd {
        AppKitEventLoop.activate()
        screenLockObserverToken = Unmanaged.passUnretained(self).toOpaque()
        registerObservers()

        while !hasFinished {
            RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 0.25))
            activityWatchFilter.tick()

            let mainRunning = ZenApp.isRunning(pid: securePid)
            let secureInUse = ZenApp.isSecureProfileInUse()

            if !hasFinished && !secureInUse && !mainRunning {
                finish(with: .userQuitZen)
            } else if !hasFinished && !mainRunning {
                if let exitTime = mainPidExitedAt {
                    if Date().timeIntervalSince(exitTime) > 1.5 {
                        Log.status("Main Zen PID \(securePid) exited; reaping lingering helpers after grace period...")
                        _ = ZenApp.terminateProcessesUsingSecureProfile()
                        finish(with: .userQuitZen)
                    }
                } else {
                    mainPidExitedAt = Date()
                }
            }
        }

        activityWatchFilter.flush()
        unregisterObservers()
        return endReason
    }

    private func finish(with reason: SecureSessionEnd) {
        guard !hasFinished else { return }
        hasFinished = true
        endReason = reason
    }

    /// Sleep/lock fast-path: hold sleep, SIGKILL holders, and eject before macOS suspends.
    private func secureVaultOnSystemEvent() {
        guard !hasFinished else { return }
        PowerManagement.acquireSleepAssertion()
        Log.status("System sleep/lock detected — securing vault under power assertion...")
        _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: true)
        if DiskImage.detach(at: mountPoint, urgent: true) {
            didUrgentEject = true
            Log.success("Urgent eject completed before sleep/lock proceeds")
        } else {
            Log.error("Urgent eject failed during sleep/lock — wake audit will retry")
        }
        finish(with: .systemLockOrSleep)
    }

    /// Wake safety net: eject leftover mounts even if sleep teardown raced the kernel.
    private func auditVaultAfterWake() {
        Log.status("System wake detected — verifying vault state...")
        guard FileSystem.exists(at: mountPoint) else {
            Log.status("Wake audit: vault not mounted")
            return
        }

        PowerManagement.acquireSleepAssertion()
        Log.status("Wake audit: vault still mounted — forcing urgent eject")
        _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: true)
        if DiskImage.detach(at: mountPoint, urgent: true) {
            didUrgentEject = true
            Log.success("Wake audit ejected leftover vault")
        } else {
            Log.error("Wake audit could not eject leftover vault at \(mountPoint)")
        }

        if !hasFinished {
            finish(with: .systemLockOrSleep)
        }
    }

    private static let onScreenLocked: CFNotificationCallback = { _, observer, _, _, _ in
        guard let observer else { return }
        let monitor = Unmanaged<SecureZenSessionMonitor>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
            monitor.secureVaultOnSystemEvent()
        }
    }

    private func registerObservers() {
        workspaceObservers.append(
            NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.willSleepNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.secureVaultOnSystemEvent()
            }
        )

        workspaceObservers.append(
            NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.didWakeNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.auditVaultAfterWake()
            }
        )

        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDistributedCenter(),
            screenLockObserverToken,
            Self.onScreenLocked,
            Zen.screenLockedNotification as CFString,
            nil,
            .deliverImmediately
        )

        workspaceObservers.append(
            NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.didTerminateApplicationNotification,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                guard let self, !self.hasFinished else { return }
                guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
                else { return }

                let pid = app.processIdentifier
                let wasSecure =
                    pid == self.securePid
                    || ZenApp.pidsUsingSecureProfile().contains(pid)

                guard wasSecure else { return }

                if !ZenApp.isSecureProfileInUse() {
                    self.finish(with: .userQuitZen)
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                        guard let self, !self.hasFinished else { return }
                        if ZenApp.isSecureProfileInUse() {
                            Log.status("Terminating lingering helpers after Zen quit...")
                            _ = ZenApp.terminateProcessesUsingSecureProfile()
                        }
                        self.finish(with: .userQuitZen)
                    }
                }
            }
        )
    }

    private func unregisterObservers() {
        if let token = screenLockObserverToken {
            CFNotificationCenterRemoveObserver(
                CFNotificationCenterGetDistributedCenter(),
                token,
                CFNotificationName(Zen.screenLockedNotification as CFString),
                nil
            )
            screenLockObserverToken = nil
        }

        workspaceObservers.forEach {
            NSWorkspace.shared.notificationCenter.removeObserver($0)
        }
        workspaceObservers.removeAll()
    }

    deinit {
        unregisterObservers()
    }
}

enum ZenBrowserLauncher {
    enum Session {
        /// Launch Zen, then hand monitoring to the LaunchAgent watchdog (Raycast exits).
        case handoffToWatchdog
        case immediate
    }

    static func launch(
        profilePath: String?,
        session: Session,
        mountPoint: String
    ) -> Bool {
        guard FileSystem.exists(at: Paths.zenApp) else {
            Log.error("Zen Browser application not found at '\(Paths.zenApp)'.")
            Log.error("Please ensure Zen Browser is installed at the correct location.")
            return false
        }

        let resolvedProfile: String?
        if let profilePath, FileSystem.exists(at: profilePath) {
            resolvedProfile = profilePath
            Log.status("Opening Zen Browser with profile: \(profilePath)")
        } else {
            resolvedProfile = nil
            Log.status("Opening Zen Browser with default profile...")
        }

        if case .handoffToWatchdog = session {
            Log.status("Zen Browser will open as a new instance.")
            Log.status("Session monitoring will run in a LaunchAgent watchdog (survives Raycast restart).")
        }

        AppKitEventLoop.activate()

        guard let securePid = ZenApp.openNewInstance(profilePath: resolvedProfile) else {
            Log.error("Zen Browser did not start within the expected time.")
            return false
        }

        Log.status("Secure Zen process PID: \(securePid)")

        switch session {
        case .handoffToWatchdog:
            guard VaultWatchdog.handoff(securePid: securePid, mountPoint: mountPoint) else {
                Log.error("Failed to hand off secure session to watchdog")
                _ = ZenApp.terminateProcessesUsingSecureProfile(urgent: true)
                _ = DiskImage.detach(at: mountPoint, urgent: true)
                VaultSessionState.remove()
                return false
            }
            Log.success("Secure session handed off to LaunchAgent watchdog.")
            return true

        case .immediate:
            Log.success("Zen Browser operation completed successfully.")
            return true
        }
    }
}

enum SecureVaultWorkflow {
    static func run(at mountPoint: String) -> Bool {
        Log.success("Profile successfully decrypted. Opening Zen Browser with secure profile...")

        let launched: Bool
        if FileSystem.exists(at: Paths.secureProfile) {
            Log.status("Secure profile found at: \(Paths.secureProfile)")
            launched = ZenBrowserLauncher.launch(
                profilePath: Paths.secureProfile,
                session: .handoffToWatchdog,
                mountPoint: mountPoint
            )
        } else {
            Log.error("Secure profile not found at '\(Paths.secureProfile)'")
            Log.status("Opening Zen Browser without specific profile...")
            launched = ZenBrowserLauncher.launch(
                profilePath: nil,
                session: .handoffToWatchdog,
                mountPoint: mountPoint
            )
        }

        return launched
    }
}

enum ProfileLauncher {
    static func run() {
        Log.status("Starting DMG Open Script")
        Log.status("DMG Path: \(Paths.encryptedVault)")

        guard FileSystem.exists(at: Paths.encryptedVault) else {
            Log.error("DMG file not found at \(Paths.encryptedVault)")
            DesktopNotification.display(
                title: "Zen Browser",
                message: "❌ Encrypted vault not found at \(Paths.encryptedVault)"
            )
            exit(1)
        }

        Log.status("Expected mount point: \(Paths.secureVolumeRoot)")

        let (isMounted, mountPoint) = DiskImage.mountStatus(for: Paths.encryptedVault)

        if isMounted, let mountPoint {
            Log.status("Secure vault is already mounted at \(mountPoint). Proceeding directly...")

            guard SecureVaultWorkflow.run(at: mountPoint) else {
                Log.error("Failed to handle secure profile workflow")
                exit(1)
            }
        } else {
            AppKitEventLoop.activate()

            guard let passphrase = VaultCredentialStore.retrieveWithBiometrics() else {
                Log.status("Touch ID cancelled — aborting")
                exit(0)
            }

            Log.status("Touch ID accepted — mounting vault...")
            guard let mountPoint = DiskImage.attach(Paths.encryptedVault, passphrase: passphrase) else {
                Log.error("Failed to mount vault")
                DesktopNotification.display(
                    title: "Zen Browser",
                    message: "❌ Failed to mount encrypted vault."
                )
                exit(1)
            }

            guard SecureVaultWorkflow.run(at: mountPoint) else {
                Log.error("Failed to handle secure profile workflow")
                exit(1)
            }
        }

        Log.success("Zen vault open — watchdog LaunchAgent owns lock/sleep eject.")
        DesktopNotification.display(
            title: "Zen Browser",
            message: "🔓 Encrypted profile open. Watchdog will eject on lock, sleep, or quit."
        )
    }
}

let arguments = CommandLine.arguments
if arguments.contains("--store-vault-password") {
    VaultCredentialSetup.run()
} else if arguments.contains("--watchdog") {
    VaultWatchdog.runWatchdog()
} else if arguments.contains("--orphan-guard") {
    VaultWatchdog.runOrphanGuard()
} else if arguments.contains("--secure-orphan") {
    AppKitEventLoop.activate()
    if VaultWatchdog.shouldSecureOrphan() {
        VaultWatchdog.secureOrphanVault(reason: "secure-orphan CLI")
        exit(0)
    }
    Log.status("No orphan vault to secure")
    exit(0)
} else {
    ProfileLauncher.run()
}
