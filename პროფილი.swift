#!/usr/bin/swift

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Open Developer
// @raycast.mode silent

// Optional parameters:

// Documentation:
// @raycast.description Open the Developer folder on terminal
// @raycast.author Johann-Goncalves-Pereira
// @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira
// @raycast.packageName Utilities

import AppKit
import Foundation
import LocalAuthentication
import Security

enum Paths {
    static let encryptedVault = NSString(string: "~/Library/Application Support/zen/Profiles/Profile.dmg").expandingTildeInPath
    static let zenApp = "/Applications/Zen.app"
    static let secureVolumeRoot = "/Volumes/.com.apple.zen.framework"
    static let secureProfile = secureVolumeRoot
    static let zenHostCache = "~/Library/Caches/app.zen-browser.zen"
    static let zenProfilesIni = "~/Library/Application Support/zen/profiles.ini"
}

enum Zen {
    static let bundleIdentifier = "app.zen-browser.zen"
    static let processName = "Zen"
    static let screenLockedNotification = "com.apple.screenIsLocked"
}

enum SystemPaths {
    static let hdiutil = "/usr/bin/hdiutil"
    static let open = "/usr/bin/open"
    static let pkill = "/usr/bin/pkill"
    static let volumesRoot = "/Volumes/"
}

enum Log {
    static func status(_ message: String) { print("🔧 \(message)") }
    static func error(_ message: String) { print("❌ \(message)") }
    static func success(_ message: String) { print("✅ \(message)") }
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

    static func detach(at mountPoint: String) -> Bool {
        for attempt in 1...3 {
            Log.status("Detach attempt \(attempt)/3 at \(mountPoint)...")

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

                if attempt < 3 {
                    Log.status("Retrying detach in 1s (resource may still be busy)...")
                    Thread.sleep(forTimeInterval: 1.0)
                }
            } catch {
                Log.error("Failed to run eject command for \(mountPoint): \(error)")

                if attempt < 3 {
                    Log.status("Retrying detach in 1s (resource may still be busy)...")
                    Thread.sleep(forTimeInterval: 1.0)
                }
            }
        }

        Log.status("Attempting forced detach...")

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

    private static func parseMountPointFromAttachOutput(_ output: String) -> String? {
        for line in output.components(separatedBy: .newlines) {
            let parts = line.split(separator: "\t")
            guard parts.count >= 3,
                  parts.last!.hasPrefix(SystemPaths.volumesRoot)
            else { continue }

            let mountPoint = String(parts.last!)
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
    static var runningInstances: [NSRunningApplication] {
        NSWorkspace.shared.runningApplications.filter {
            $0.bundleIdentifier == Zen.bundleIdentifier && !$0.isTerminated
        }
    }

    static var isRunning: Bool {
        !runningInstances.isEmpty
    }

    static func waitUntilLaunched(timeout: TimeInterval = 15) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            if isRunning { return true }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
        }

        return isRunning
    }

    static func forceTerminateAll() -> Bool {
        let instances = runningInstances

        if instances.isEmpty {
            Log.status("Zen Browser is not running")
            return true
        }

        instances.forEach { $0.forceTerminate() }

        for _ in 0..<25 {
            if !isRunning {
                Log.success("Zen Browser process killed successfully")
                return true
            }
            Thread.sleep(forTimeInterval: 0.2)
        }

        do {
            _ = try ProcessRunner.capture(
                executable: SystemPaths.pkill,
                arguments: ["-x", Zen.processName]
            )

            if !isRunning {
                Log.success("Zen Browser process killed successfully")
                return true
            }

            Log.error("Failed to kill Zen Browser process")
            return false
        } catch {
            Log.error("Error killing Zen Browser process: \(error)")
            return false
        }
    }
}

enum SecureSessionEnd {
    case userQuitZen
    case systemLockOrSleep
}

final class SecureZenSessionMonitor {
    private var workspaceObservers: [NSObjectProtocol] = []
    private var screenLockObserverToken: UnsafeMutableRawPointer?
    private var hasFinished = false
    private var endReason: SecureSessionEnd = .userQuitZen

    func waitUntilSessionEnds() -> SecureSessionEnd {
        AppKitEventLoop.activate()
        screenLockObserverToken = Unmanaged.passUnretained(self).toOpaque()
        registerObservers()

        while !hasFinished {
            RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 0.25))

            if !hasFinished && !ZenApp.isRunning {
                finish(with: .userQuitZen)
            }
        }

        unregisterObservers()
        return endReason
    }

    private func finish(with reason: SecureSessionEnd) {
        guard !hasFinished else { return }
        hasFinished = true
        endReason = reason
    }

    private func secureVaultOnSystemEvent() {
        guard !hasFinished else { return }
        Log.status("System sleep/lock detected — securing vault...")
        _ = ZenApp.forceTerminateAll()
        finish(with: .systemLockOrSleep)
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
                guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                      app.bundleIdentifier == Zen.bundleIdentifier
                else { return }

                self.finish(with: .userQuitZen)
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
        case monitoredSecureVault
        case immediate
    }

    static func launch(
        profilePath: String?,
        session: Session
    ) -> Bool {
        guard FileSystem.exists(at: Paths.zenApp) else {
            Log.error("Zen Browser application not found at '\(Paths.zenApp)'.")
            Log.error("Please ensure Zen Browser is installed at the correct location.")
            return false
        }

        var arguments = [Paths.zenApp]

        if let profilePath, FileSystem.exists(at: profilePath) {
            arguments.append(contentsOf: ["--args", "--profile", profilePath])
            Log.status("Opening Zen Browser with profile: \(profilePath)")
        } else {
            Log.status("Opening Zen Browser with default profile...")
        }

        if case .monitoredSecureVault = session {
            Log.status("Zen Browser will open. The script will wait for it to be closed before continuing.")
            Log.status("Monitoring for system sleep and screen lock events.")
        }

        do {
            let (exitCode, _) = try ProcessRunner.capture(
                executable: SystemPaths.open,
                arguments: arguments
            )

            switch session {
            case .monitoredSecureVault:
                guard ZenApp.waitUntilLaunched() else {
                    Log.error("Zen Browser did not start within the expected time.")
                    return false
                }

                let endReason = SecureZenSessionMonitor().waitUntilSessionEnds()

                switch endReason {
                case .userQuitZen:
                    Log.success("Zen Browser operation completed successfully.")
                case .systemLockOrSleep:
                    Log.success("Vault secured due to system sleep or lock.")
                }

                return true

            case .immediate:
                if exitCode == 0 {
                    Log.success("Zen Browser operation completed successfully.")
                    return true
                }

                Log.error("Zen Browser exited with status \(exitCode).")
                return false
            }
        } catch {
            Log.error("Failed to open Zen Browser: \(error)")
            return false
        }
    }
}

enum SecureVaultWorkflow {
    static func run(at mountPoint: String) -> Bool {
        Log.success("Profile successfully decrypted. Opening Zen Browser with secure profile...")

        let zenLaunched: Bool

        if FileSystem.exists(at: Paths.secureProfile) {
            Log.status("Secure profile found at: \(Paths.secureProfile)")
            zenLaunched = ZenBrowserLauncher.launch(
                profilePath: Paths.secureProfile,
                session: .monitoredSecureVault
            )
        } else {
            Log.error("Secure profile not found at '\(Paths.secureProfile)'")
            Log.status("Opening Zen Browser without specific profile...")
            zenLaunched = ZenBrowserLauncher.launch(
                profilePath: nil,
                session: .monitoredSecureVault
            )
        }

        Log.status("Zen session ended. Purging host footprint...")
        HostFootprint.purgeZenHostCache()
        HostFootprint.scrubZenProfilesIni()

        Log.status("Ejecting vault...")

        if !DiskImage.detach(at: mountPoint) {
            Log.error("Failed to eject DMG properly")
        }

        return zenLaunched
    }
}

enum ProfileLauncher {
    static func run() {
        Log.status("Starting DMG Open Script")
        Log.status("DMG Path: \(Paths.encryptedVault)")

        guard FileSystem.exists(at: Paths.encryptedVault) else {
            Log.error("DMG file not found at \(Paths.encryptedVault)")
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
                exit(1)
            }

            guard SecureVaultWorkflow.run(at: mountPoint) else {
                Log.error("Failed to handle secure profile workflow")
                exit(1)
            }
        }

        Log.success("Zen Decrypt workflow completed successfully!")
    }
}

if CommandLine.arguments.contains("--store-vault-password") {
    VaultCredentialSetup.run()
} else {
    ProfileLauncher.run()
}
