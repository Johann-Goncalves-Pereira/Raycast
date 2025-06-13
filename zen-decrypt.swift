#!/usr/bin/swift

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Zen Decrypt
// @raycast.mode silent

// Optional parameters:
// @raycast.icon ./icons/zen.svg

// Documentation:
// @raycast.description Zen Decrypt Profile
// @raycast.author Johann-Goncalves-Pereira
// @raycast.authorURL https://raycast.com/Johann-Goncalves-Pereira
// @raycast.packageName Utilities

import Foundation

// MARK: - Configuration & Constants

/// Path configurations for the application
struct PathConfiguration {
    static let dmgPath = NSString(string: "~/Library/Application Support/zen/Profiles/Profile.dmg").expandingTildeInPath
    static let protonPassPath = "/Applications/Proton Pass.app"
    static let zenAppPath = "/Applications/Zen.app"
    static let secureProfilePath = "/Volumes/Profile Secure/j3wki3fc.Secure"
    static let personalProfilePath = "~/Library/Application Support/zen/Profiles/zi76byi5.Pesonal"
}

/// Application constants
struct Constants {
    static let fileManager = FileManager.default
    static let volumesPrefix = "/Volumes/"
}

// MARK: - Data Models

/// Represents the output from hdiutil info command
struct HDIUtilInfo: Codable {
    let images: [HDIUtilImage]
}

/// Represents a disk image in hdiutil info output
struct HDIUtilImage: Codable {
    let imagePath: String
    let systemEntities: [HDIUtilSystemEntity]?
    
    enum CodingKeys: String, CodingKey {
        case imagePath = "image-path"
        case systemEntities = "system-entities"
    }
}

/// Represents a system entity within a disk image
struct HDIUtilSystemEntity: Codable {
    let contentHint: String?
    let mountPoint: String?
    let volumeKind: String?
    
    enum CodingKeys: String, CodingKey {
        case contentHint = "content-hint"
        case mountPoint = "mount-point"
        case volumeKind = "volume-kind"
    }
}

// MARK: - Utility Functions

/// Validates if a file exists at the given path
/// - Parameter path: The file path to check
/// - Returns: True if file exists, false otherwise
func fileExists(at path: String) -> Bool {
    return Constants.fileManager.fileExists(atPath: path)
}

/// Gets the volume name from a DMG file path
/// - Parameter dmgPath: Path to the DMG file
/// - Returns: The expected volume name
func getVolumeNameFromDMG(_ dmgPath: String) -> String {
    let dmgURL = URL(fileURLWithPath: dmgPath)
    return dmgURL.deletingPathExtension().lastPathComponent
}

/// Expands tilde in file paths to full home directory path
/// - Parameter path: Path potentially containing tilde
/// - Returns: Expanded path
func expandTildePath(_ path: String) -> String {
    return NSString(string: path).expandingTildeInPath
}

/// Prints a formatted status message
/// - Parameter message: The message to print
func printStatus(_ message: String) {
    print("🔧 \(message)")
}

/// Prints a formatted error message
/// - Parameter message: The error message to print
func printError(_ message: String) {
    print("❌ \(message)")
}

/// Prints a formatted success message
/// - Parameter message: The success message to print
func printSuccess(_ message: String) {
    print("✅ \(message)")
}

// MARK: - DMG Management Functions

/// Gets the current mount point for a DMG file if it's already mounted
/// - Parameter imagePath: Path to the DMG file
/// - Returns: Mount point path if mounted, nil otherwise
func getMountPointForDMG(imagePath: String) -> String? {
    let task = Process()
    task.launchPath = "/usr/bin/hdiutil"
    task.arguments = ["info", "-plist"]
    let pipe = Pipe()
    task.standardOutput = pipe

    do {
        try task.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()

        if task.terminationStatus == 0 {
            let plistDecoder = PropertyListDecoder()
            if let plist = try? plistDecoder.decode(HDIUtilInfo.self, from: data) {
                // Search through all mounted images
                for image in plist.images {
                    if image.imagePath == imagePath {
                        if let systemEntities = image.systemEntities {
                            for entity in systemEntities {
                                if let mountPoint = entity.mountPoint {
                                    return mountPoint
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch {
        printError("Error getting hdiutil info: \(error)")
    }
    return nil
}

/// Checks if DMG is currently mounted and returns mount status
/// - Parameter dmgPath: Path to the DMG file
/// - Returns: Tuple containing mount status and mount point if available
func checkDMGMountStatus(_ dmgPath: String) -> (isMounted: Bool, mountPoint: String?) {
    let mountPoint = getMountPointForDMG(imagePath: dmgPath)
    return (mountPoint != nil, mountPoint)
}

/// Mounts a DMG file and returns the mount point
/// - Parameter dmgPath: Path to the DMG file to mount
/// - Returns: Mount point if successful, nil if failed
func mountDMG(_ dmgPath: String) -> String? {
    printStatus("Attempting to mount \(dmgPath)...")
    print("IMPORTANT: If the DMG is encrypted, macOS will now ask for the password.")
    print("This script cannot enter the password for you.")

    let task = Process()
    let pipe = Pipe()
    
    task.launchPath = "/usr/bin/hdiutil"
    task.arguments = ["attach", dmgPath, "-nobrowse"]
    task.standardOutput = pipe
    task.standardError = pipe

    do {
        try task.run()
        
        let outputData = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()

        let output = String(data: outputData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        printStatus("hdiutil attach command finished.")
        printStatus("Termination Status: \(task.terminationStatus)")
        
        if !output.isEmpty { 
            print("Output:\n\(output)") 
        }

        if task.terminationStatus == 0 {
            // Try to get the mount point using hdiutil info
            if let mountPoint = getMountPointForDMG(imagePath: dmgPath) {
                printSuccess("DMG mounted successfully at \(mountPoint)")
                return mountPoint
            } else {
                // Fallback: parse hdiutil output
                return parseMountPointFromOutput(output)
            }
        } else {
            return handleMountFailure(output: output, terminationStatus: task.terminationStatus)
        }
    } catch {
        printError("Failed to execute hdiutil: \(error)")
        return nil
    }
}

/// Parses mount point from hdiutil attach output
/// - Parameter output: The output string from hdiutil
/// - Returns: Mount point if found, nil otherwise
func parseMountPointFromOutput(_ output: String) -> String? {
    let lines = output.components(separatedBy: .newlines)
    for line in lines {
        let parts = line.split(separator: "\t")
        if parts.count >= 3 && parts.last!.hasPrefix(Constants.volumesPrefix) {
            let mountPoint = String(parts.last!)
            printSuccess("DMG mounted successfully. Determined mount point: \(mountPoint)")
            return mountPoint
        }
    }
    
    printError("DMG attach seemed to succeed but could not determine mount point.")
    print("Please check if a password prompt appeared and was handled correctly.")
    return nil
}

/// Handles mount failure scenarios
/// - Parameters:
///   - output: Output from hdiutil command
///   - terminationStatus: Exit status of hdiutil
/// - Returns: nil (mount failed)
func handleMountFailure(output: String, terminationStatus: Int32) -> String? {
    printError("Error mounting DMG. hdiutil exited with status \(terminationStatus).")
    
    let authErrors = ["Authentication_Canceled", "authentication error", "cancelled", 
                     "attach canceled", "hdiutil: attach canceled"]
    
    if authErrors.contains(where: output.contains) {
        printError("Mounting failed due to password prompt cancellation or incorrect password.")
        printStatus("Will proceed with personal profile instead.")
        return nil // Signal to use personal profile
    } else {
        printError("DMG mounting failed for other reasons.")
        exit(1)
    }
}

/// Safely ejects a mounted DMG
/// - Parameter mountPoint: The mount point to eject
/// - Returns: True if successful, false otherwise
func ejectDMG(at mountPoint: String) -> Bool {
    printStatus("Attempting to eject DMG at \(mountPoint)...")
    
    let task = Process()
    task.launchPath = "/usr/bin/hdiutil"
    task.arguments = ["detach", mountPoint]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = pipe

    do {
        try task.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()

        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if task.terminationStatus == 0 {
            printSuccess("Successfully ejected \(mountPoint). Output: \(output)")
            return true
        } else {
            printError("Error ejecting DMG \(mountPoint). Status: \(task.terminationStatus). Output: \(output)")
            return false
        }
    } catch {
        printError("Failed to run eject command for \(mountPoint): \(error)")
        return false
    }
}

// MARK: - Application Management Functions

/// Opens Proton Pass application if available
/// - Returns: True if opened successfully or if not critical, false if critical failure
func openProtonPassIfAvailable() -> Bool {
    guard fileExists(at: PathConfiguration.protonPassPath) else {
        printError("Proton Pass not found at '\(PathConfiguration.protonPassPath)'")
        return true // Not critical, continue
    }
    
    printStatus("Opening Proton Pass...")
    let task = Process()
    task.launchPath = "/usr/bin/open"
    task.arguments = [PathConfiguration.protonPassPath]

    do {
        try task.run()
        printSuccess("Proton Pass opened successfully")
        return true
    } catch {
        printError("Failed to open Proton Pass: \(error)")
        return true // Continue even if Proton Pass fails
    }
}

/// Opens Zen Browser with specified profile and waits for it to close
/// - Parameters:
///   - profilePath: Path to the browser profile
///   - waitForClose: Whether to wait for the browser to close
/// - Returns: True if successful, false otherwise
func openZenBrowser(with profilePath: String?, waitForClose: Bool = true) -> Bool {
    guard fileExists(at: PathConfiguration.zenAppPath) else {
        printError("Zen Browser application not found at '\(PathConfiguration.zenAppPath)'.")
        printError("Please ensure Zen Browser is installed at the correct location.")
        return false
    }
    
    let task = Process()
    task.launchPath = "/usr/bin/open"
    
    var arguments = [PathConfiguration.zenAppPath]
    if waitForClose {
        arguments.insert("-W", at: 0) // Wait flag
    }
    
    if let profilePath = profilePath, fileExists(at: profilePath) {
        arguments.append(contentsOf: ["--args", "--profile", profilePath])
        printStatus("Opening Zen Browser with profile: \(profilePath)")
    } else {
        printStatus("Opening Zen Browser with default profile...")
    }
    
    task.arguments = arguments

    do {
        if waitForClose {
            printStatus("Zen Browser will open. The script will wait for it to be closed before continuing.")
        }
        
        try task.run()
        
        if waitForClose {
            task.waitUntilExit()
        }
        
        if task.terminationStatus == 0 {
            printSuccess("Zen Browser operation completed successfully.")
            return true
        } else {
            printError("Zen Browser exited with status \(task.terminationStatus).")
            return false
        }
    } catch {
        printError("Failed to open Zen Browser: \(error)")
        return false
    }
}

// MARK: - Main Logic Functions

/// Handles the secure profile workflow when DMG is mounted
/// - Parameter mountPoint: The mount point of the DMG
/// - Returns: True if successful, false otherwise
func handleSecureProfile(mountPoint: String) -> Bool {
    printSuccess("Profile successfully decrypted. Opening Zen Browser with secure profile...")
    
    defer {
        // Always try to eject the DMG when done
        if !ejectDMG(at: mountPoint) {
            printError("Failed to eject DMG properly")
        }
    }
    
    // Check if secure profile exists
    if fileExists(at: PathConfiguration.secureProfilePath) {
        printStatus("Secure profile found at: \(PathConfiguration.secureProfilePath)")
        return openZenBrowser(with: PathConfiguration.secureProfilePath, waitForClose: true)
    } else {
        printError("Secure profile not found at '\(PathConfiguration.secureProfilePath)'")
        printStatus("Opening Zen Browser without specific profile...")
        return openZenBrowser(with: nil, waitForClose: true)
    }
}

/// Handles the personal profile workflow when DMG is not available
/// - Returns: True if successful, false otherwise
func handlePersonalProfile() -> Bool {
    printStatus("DMG was not mounted or password was incorrect. Opening Zen Browser with personal profile...")
    
    let expandedPersonalProfilePath = expandTildePath(PathConfiguration.personalProfilePath)
    printStatus("Using personal profile at: \(expandedPersonalProfilePath)")
    
    if fileExists(at: expandedPersonalProfilePath) {
        printStatus("Opening Zen Browser with personal profile...")
        return openZenBrowser(with: expandedPersonalProfilePath, waitForClose: false)
    } else {
        printStatus("Personal profile not found. Opening Zen Browser with default profile...")
        return openZenBrowser(with: nil, waitForClose: false)
    }
}

/// Main application workflow orchestrator
func runZenDecryptWorkflow() {
    printStatus("Starting DMG Open Script")
    printStatus("DMG Path: \(PathConfiguration.dmgPath)")
    
    // Step 1: Validate DMG file exists
    guard fileExists(at: PathConfiguration.dmgPath) else {
        printError("DMG file not found at \(PathConfiguration.dmgPath)")
        exit(1)
    }
    
    let volumeName = getVolumeNameFromDMG(PathConfiguration.dmgPath)
    printStatus("Expected Volume Name: \(volumeName)")
    
    // Step 2: Check if DMG is already mounted
    let (isMounted, currentMountPoint) = checkDMGMountStatus(PathConfiguration.dmgPath)
    
    if isMounted, let mountPoint = currentMountPoint {
        printStatus("\(volumeName) is already mounted at \(mountPoint). Skipping Proton Pass and proceeding directly...")
        
        if !handleSecureProfile(mountPoint: mountPoint) {
            printError("Failed to handle secure profile workflow")
            exit(1)
        }
    } else {
        // Step 3: Open Proton Pass (not critical if it fails)
        _ = openProtonPassIfAvailable()
        
        // Step 4: Attempt to mount DMG
        if let mountPoint = mountDMG(PathConfiguration.dmgPath) {
            if !handleSecureProfile(mountPoint: mountPoint) {
                printError("Failed to handle secure profile workflow")
                exit(1)
            }
        } else {
            // Step 5: Fallback to personal profile
            if !handlePersonalProfile() {
                printError("Failed to handle personal profile workflow")
                exit(1)
            }
        }
    }
    
    printSuccess("Zen Decrypt workflow completed successfully!")
}

// MARK: - Entry Point

// Run the main workflow
runZenDecryptWorkflow()
