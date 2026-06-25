#!/usr/bin/swift

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title პროფილი
// @raycast.mode silent

// Optional parameters:

// Documentation:
// @raycast.description პროფილი
// @raycast.author Johann-Goncalves-Pereira
// @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira
// @raycast.packageName Utilities

import AppKit
import Foundation

enum Paths {
    static let encryptedVault = NSString(string: "~/Library/Application Support/zen/Profiles/Profile.dmg").expandingTildeInPath
    static let protonPassApp = "/Applications/Proton Pass.app"
    static let zenApp = "/Applications/Zen.app"
    static let secureProfile = "/Volumes/Profile Secure/j3wki3fc.Secure"
    static let personalProfile = "~/Library/Application Support/zen/Profiles/zi76byi5.Pesonal"
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
    static func captureData(executable: String, arguments: [String]) throws -> (exitCode: Int32, data: Data) {
        let task = Process()
        task.launchPath = executable
        task.arguments = arguments

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        try task.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()

        return (task.terminationStatus, data)
    }

    static func capture(executable: String, arguments: [String]) throws -> (exitCode: Int32, output: String) {
        let (exitCode, data) = try captureData(executable: executable, arguments: arguments)
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
                    if let mountPoint = entity.mountPoint {
                        return mountPoint
                    }
                }
            }
        } catch {
            Log.error("Error getting hdiutil info: \(error)")
        }

        return nil
    }

    static func mountStatus(for dmgPath: String) -> (isMounted: Bool, mountPoint: String?) {
        let mountPoint = mountPoint(for: dmgPath)
        return (mountPoint != nil, mountPoint)
    }

    static func attach(_ dmgPath: String) -> String? {
        Log.status("Attempting to mount \(dmgPath)...")
        print("IMPORTANT: If the DMG is encrypted, macOS will now ask for the password.")
        print("This script cannot enter the password for you.")

        do {
            let (exitCode, output) = try ProcessRunner.capture(
                executable: SystemPaths.hdiutil,
                arguments: ["attach", dmgPath, "-nobrowse"]
            )

            Log.status("hdiutil attach command finished.")
            Log.status("Termination Status: \(exitCode)")

            if !output.isEmpty {
                print("Output:\n\(output)")
            }

            guard exitCode == 0 else {
                return resolveMountFailure(output: output, exitCode: exitCode)
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
        Log.status("Attempting to eject DMG at \(mountPoint)...")

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
            return false
        } catch {
            Log.error("Failed to run eject command for \(mountPoint): \(error)")
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
            Log.success("DMG mounted successfully. Determined mount point: \(mountPoint)")
            return mountPoint
        }

        Log.error("DMG attach seemed to succeed but could not determine mount point.")
        print("Please check if a password prompt appeared and was handled correctly.")
        return nil
    }

    private static func resolveMountFailure(output: String, exitCode: Int32) -> String? {
        Log.error("Error mounting DMG. hdiutil exited with status \(exitCode).")

        let passwordPromptFailures = [
            "Authentication_Canceled",
            "authentication error",
            "cancelled",
            "attach canceled",
            "hdiutil: attach canceled"
        ]

        if passwordPromptFailures.contains(where: output.contains) {
            Log.error("Mounting failed due to password prompt cancellation or incorrect password.")
            Log.status("Will proceed with personal profile instead.")
            return nil
        }

        Log.error("DMG mounting failed for other reasons.")
        exit(1)
    }
}

enum AppKitEventLoop {
    static func activate() {
        NSApplication.shared.setActivationPolicy(.accessory)
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

enum ProtonPassApp {
    static func openWhenZenIsNotRunning() -> Bool {
        if ZenApp.isRunning {
            Log.status("Zen is already running, skipping Proton Pass launch")
            return true
        }

        guard FileSystem.exists(at: Paths.protonPassApp) else {
            Log.error("Proton Pass not found at '\(Paths.protonPassApp)'")
            return true
        }

        Log.status("Opening Proton Pass...")

        do {
            try ProcessRunner.run(executable: SystemPaths.open, arguments: [Paths.protonPassApp])
            Log.success("Proton Pass opened successfully")
            return true
        } catch {
            Log.error("Failed to open Proton Pass: \(error)")
            return true
        }
    }

    static func terminate() -> Bool {
        do {
            let (exitCode, _) = try ProcessRunner.capture(
                executable: SystemPaths.pkill,
                arguments: ["-f", "Proton Pass"]
            )

            switch exitCode {
            case 0:
                Log.success("Proton Pass process killed successfully")
                return true
            case 1:
                Log.status("Proton Pass is not running")
                return true
            default:
                Log.error("Failed to kill Proton Pass process")
                return false
            }
        } catch {
            Log.error("Error killing Proton Pass process: \(error)")
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
        session: Session,
        terminateProtonPassAfterLaunch: Bool
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

            if terminateProtonPassAfterLaunch {
                if !ProtonPassApp.terminate() {
                    Log.error("Failed to kill Proton Pass process")
                }
            } else {
                Log.status("Skipping Proton Pass termination as requested")
            }

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
    static func run(at mountPoint: String, terminateProtonPassAfterLaunch: Bool) -> Bool {
        Log.success("Profile successfully decrypted. Opening Zen Browser with secure profile...")

        let zenLaunched: Bool

        if FileSystem.exists(at: Paths.secureProfile) {
            Log.status("Secure profile found at: \(Paths.secureProfile)")
            zenLaunched = ZenBrowserLauncher.launch(
                profilePath: Paths.secureProfile,
                session: .monitoredSecureVault,
                terminateProtonPassAfterLaunch: terminateProtonPassAfterLaunch
            )
        } else {
            Log.error("Secure profile not found at '\(Paths.secureProfile)'")
            Log.status("Opening Zen Browser without specific profile...")
            zenLaunched = ZenBrowserLauncher.launch(
                profilePath: nil,
                session: .monitoredSecureVault,
                terminateProtonPassAfterLaunch: terminateProtonPassAfterLaunch
            )
        }

        Log.status("Zen session ended. Ejecting vault...")

        if !DiskImage.detach(at: mountPoint) {
            Log.error("Failed to eject DMG properly")
        }

        return zenLaunched
    }
}

enum PersonalProfileWorkflow {
    static func run() -> Bool {
        Log.status("DMG was not mounted or password was incorrect. Opening Zen Browser with personal profile...")

        let personalProfilePath = FileSystem.expandingTilde(in: Paths.personalProfile)
        Log.status("Using personal profile at: \(personalProfilePath)")

        if FileSystem.exists(at: personalProfilePath) {
            Log.status("Opening Zen Browser with personal profile...")
            return ZenBrowserLauncher.launch(
                profilePath: personalProfilePath,
                session: .immediate,
                terminateProtonPassAfterLaunch: false
            )
        }

        Log.status("Personal profile not found. Opening Zen Browser with default profile...")
        return ZenBrowserLauncher.launch(
            profilePath: nil,
            session: .immediate,
            terminateProtonPassAfterLaunch: false
        )
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

        let volumeName = DiskImage.volumeName(from: Paths.encryptedVault)
        Log.status("Expected Volume Name: \(volumeName)")

        let (isMounted, mountPoint) = DiskImage.mountStatus(for: Paths.encryptedVault)

        if isMounted, let mountPoint {
            Log.status("\(volumeName) is already mounted at \(mountPoint). Skipping Proton Pass and proceeding directly...")

            guard SecureVaultWorkflow.run(at: mountPoint, terminateProtonPassAfterLaunch: false) else {
                Log.error("Failed to handle secure profile workflow")
                exit(1)
            }
        } else {
            _ = ProtonPassApp.openWhenZenIsNotRunning()

            if let mountPoint = DiskImage.attach(Paths.encryptedVault) {
                guard SecureVaultWorkflow.run(at: mountPoint, terminateProtonPassAfterLaunch: true) else {
                    Log.error("Failed to handle secure profile workflow")
                    exit(1)
                }
            } else {
                guard PersonalProfileWorkflow.run() else {
                    Log.error("Failed to handle personal profile workflow")
                    exit(1)
                }
            }
        }

        Log.success("Zen Decrypt workflow completed successfully!")
    }
}

ProfileLauncher.run()
