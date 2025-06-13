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

// --- Configuration ---
// Path from your error message
let dmgPath = "/Users/johannpereira/Movies/Profile.dmg"
// --- End Configuration ---

let fileManager = FileManager.default
let task = Process()
let pipe = Pipe()

// Check if the DMG file exists
guard fileManager.fileExists(atPath: dmgPath) else {
    print("Error: DMG file not found at \(dmgPath)")
    exit(1)
}

// Get the volume name (often the same as the DMG name without the extension)
let dmgURL = URL(fileURLWithPath: dmgPath)
let volumeName = dmgURL.deletingPathExtension().lastPathComponent
var expectedMountPoint = "/Volumes/\(volumeName)"  // Default assumption

print("--- Starting DMG Open Script ---")
print("DMG Path: \(dmgPath)")
print("Expected Volume Name: \(volumeName)")

// Function to get current mounted volumes for a given disk image path
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
        print("Error getting hdiutil info: \(error)")
    }
    return nil
}

// Define Plist structures for hdiutil info
struct HDIUtilInfo: Codable {
    let images: [HDIUtilImage]

    enum CodingKeys: String, CodingKey {
        case images = "images"
    }
}

struct HDIUtilImage: Codable {
    let imagePath: String
    let systemEntities: [HDIUtilSystemEntity]?

    enum CodingKeys: String, CodingKey {
        case imagePath = "image-path"
        case systemEntities = "system-entities"
    }
}

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

// Check if the DMG is already mounted by inspecting hdiutil info
var actualMountPoint = getMountPointForDMG(imagePath: dmgPath)
var isMounted = actualMountPoint != nil

if isMounted {
    if let mountPath = actualMountPoint {
        expectedMountPoint = mountPath  // Update expectedMountPoint if we found an actual one
        print(
            "\(volumeName) is already mounted at \(mountPath). Skipping Proton Pass and proceeding directly..."
        )
    }
} else {
    // Only open Proton Pass if DMG is not already mounted
    let protonPassPath = "/Applications/Proton Pass.app"
    if fileManager.fileExists(atPath: protonPassPath) {
        print("Opening Proton Pass...")
        let openProtonTask = Process()
        openProtonTask.launchPath = "/usr/bin/open"
        openProtonTask.arguments = [protonPassPath]

        do {
            try openProtonTask.run()
            print("Proton Pass opened successfully")
        } catch {
            print("Warning: Failed to open Proton Pass: \(error)")
            // Continue with the script even if Proton Pass fails to open
        }
    } else {
        print("Warning: Proton Pass not found at '\(protonPassPath)'")
    }

    print("Attempting to mount \(dmgPath)...")
    print("IMPORTANT: If the DMG is encrypted, macOS will now ask for the password.")
    print("This script cannot enter the password for you.")

    task.launchPath = "/usr/bin/hdiutil"
    // Removed -quiet, added -mountrandom /tmp to handle cases where /Volumes/Name is taken
    // -nobrowse still prevents Finder from opening it, we'll do it manually
    // Removed -owners_on as it was causing an error
    task.arguments = ["attach", dmgPath, "-nobrowse"]
    task.standardOutput = pipe
    task.standardError = pipe  // Capture error output as well

    do {
        try task.run()

        // It's important to read the data *while* the task is running or right after,
        // especially if it's interactive or produces a lot of output.
        let outputData = pipe.fileHandleForReading.readDataToEndOfFile()
        let errorData = (task.standardError as! Pipe).fileHandleForReading.readDataToEndOfFile()  // This assumes standardError is a Pipe

        task.waitUntilExit()  // Wait for the process to complete

        let output =
            String(data: outputData, encoding: .utf8)?.trimmingCharacters(
                in: .whitespacesAndNewlines) ?? ""
        let errorOutput =
            String(data: errorData, encoding: .utf8)?.trimmingCharacters(
                in: .whitespacesAndNewlines) ?? ""

        print("hdiutil attach command finished.")
        print("Termination Status: \(task.terminationStatus)")
        if !output.isEmpty { print("Standard Output:\n\(output)") }
        if !errorOutput.isEmpty { print("Standard Error:\n\(errorOutput)") }

        if task.terminationStatus == 0 {
            // Try to get the mount point again after attach
            actualMountPoint = getMountPointForDMG(imagePath: dmgPath)
            if let mountPath = actualMountPoint {
                isMounted = true
                expectedMountPoint = mountPath
                print("DMG mounted successfully at \(mountPath).")
            } else {
                // Fallback: hdiutil output parsing (less reliable than hdiutil info)
                // Example output: /dev/diskX\tTYPE\t/Volumes/MOUNT_NAME
                let lines = output.components(separatedBy: .newlines)
                for line in lines {
                    let parts = line.split(separator: "\t")  // tab-separated
                    if parts.count >= 3 && parts.last!.hasPrefix("/Volumes/") {
                        actualMountPoint = String(parts.last!)
                        isMounted = true
                        expectedMountPoint = actualMountPoint!
                        print(
                            "DMG mounted successfully. Determined mount point: \(expectedMountPoint)"
                        )
                        break
                    }
                }
                if !isMounted {
                    print(
                        "DMG attach command seemed to succeed (exit code 0) but could not determine mount point."
                    )
                    print("Please check if a password prompt appeared and was handled correctly.")
                    exit(1)
                }
            }
        } else {
            print("Error mounting DMG. hdiutil exited with status \(task.terminationStatus).")
            if errorOutput.contains("Authentication_Canceled")
                || errorOutput.contains("authentication error") 
                || errorOutput.contains("cancelled")
                || output.contains("attach canceled")
                || output.contains("hdiutil: attach canceled")
            {
                print(
                    "Mounting failed due to password prompt cancellation or incorrect password."
                )
                print("Will proceed with personal profile instead.")
                // Don't exit here, let the script continue to open personal profile
            } else {
                print("DMG mounting failed for other reasons.")
                exit(1)
            }
        }
    } catch {
        print("Failed to execute hdiutil: \(error)")
        exit(1)
    }
}

if isMounted {
    do {
        print("Profile successfully decrypted. Opening Zen Browser with secure profile...")
        let zenAppPath = "/Applications/Zen.app"
        let secureProfilePath = "/Volumes/Profile Secure/j3wki3fc.Secure"

        // Check if the secure profile exists
        if fileManager.fileExists(atPath: secureProfilePath) {
            print("Secure profile found at: \(secureProfilePath)")
            
            if fileManager.fileExists(atPath: zenAppPath) {
                let openZenTask = Process()
                openZenTask.launchPath = "/usr/bin/open"
                openZenTask.arguments = ["-W", zenAppPath, "--args", "--profile", secureProfilePath]

                print(
                    "Zen Browser will be opened with secure profile. The script will wait for it to be closed before ejecting the DMG."
                )

                try openZenTask.run()
                openZenTask.waitUntilExit()  // This waits because of the -W flag

                if openZenTask.terminationStatus == 0 {
                    print("Zen Browser was closed successfully.")
                } else {
                    print(
                        "Zen Browser exited with status \(openZenTask.terminationStatus)."
                    )
                    print("Exiting script because Zen Browser did not close successfully.")
                    exit(1)
                }
            } else {
                print("Error: Zen Browser application not found at '\(zenAppPath)'.")
                print(
                    "Please ensure Zen Browser is installed at the correct location or update the script with the correct path."
                )
                print("Exiting script because Zen Browser could not be found.")
                exit(1)
            }
        } else {
            print("Warning: Secure profile not found at '\(secureProfilePath)'")
            print("Opening Zen Browser without specific profile...")
            
            if fileManager.fileExists(atPath: zenAppPath) {
                let openZenTask = Process()
                openZenTask.launchPath = "/usr/bin/open"
                openZenTask.arguments = ["-W", zenAppPath]

                try openZenTask.run()
                openZenTask.waitUntilExit()

                if openZenTask.terminationStatus == 0 {
                    print("Zen Browser was closed successfully.")
                } else {
                    print("Zen Browser exited with status \(openZenTask.terminationStatus).")
                    exit(1)
                }
            } else {
                print("Error: Zen Browser application not found at '\(zenAppPath)'.")
                exit(1)
            }
        }

        // --- BEGIN ADDITION: Eject DMG ---
        print("Attempting to eject DMG at \(expectedMountPoint)...")
        let ejectTask = Process()
        ejectTask.launchPath = "/usr/bin/hdiutil"
        ejectTask.arguments = ["detach", expectedMountPoint]
        let ejectPipe = Pipe()
        ejectTask.standardOutput = ejectPipe
        ejectTask.standardError = ejectPipe

        try ejectTask.run()
        let ejectData = ejectPipe.fileHandleForReading.readDataToEndOfFile()
        ejectTask.waitUntilExit()

        let ejectOutput =
            String(data: ejectData, encoding: .utf8)?.trimmingCharacters(
                in: .whitespacesAndNewlines) ?? ""

        if ejectTask.terminationStatus == 0 {
            print("Successfully ejected \(expectedMountPoint). Output: \(ejectOutput)")
        } else {
            print(
                "Error ejecting DMG \(expectedMountPoint). Status: \(ejectTask.terminationStatus). Output: \(ejectOutput)"
            )
            // You might want to exit(1) here if ejection is critical
        }
        // --- END ADDITION: Eject DMG ---

    } catch {
        print("Failed to open volume or manage Zen Browser/ejection: \(error)")
        // If opening the volume failed catastrophically, we might not have a valid mount point to eject.
        // However, if Zen Browser or eject failed, the mount point should still be valid.
        // Consider if an eject attempt is still needed here.
        // For now, if an error occurs in this block, we'll try to eject if actualMountPoint is set.
        if let mountPath = actualMountPoint {
            print(
                "Attempting to eject \(mountPath) due to an error during the open/Zen Browser process."
            )
            let emergencyEjectTask = Process()
            emergencyEjectTask.launchPath = "/usr/bin/hdiutil"
            emergencyEjectTask.arguments = ["detach", mountPath]
            do {
                try emergencyEjectTask.run()
                emergencyEjectTask.waitUntilExit()
                if emergencyEjectTask.terminationStatus == 0 {
                    print("Emergency eject successful for \(mountPath).")
                } else {
                    print(
                        "Emergency eject failed for \(mountPath), status: \(emergencyEjectTask.terminationStatus)."
                    )
                }
            } catch {
                print("Failed to run emergency eject for \(mountPath): \(error)")
            }
        }
        exit(1)
    }
} else {
    print("DMG was not mounted or password was incorrect. Opening Zen Browser with personal profile...")
    let zenAppPath = "/Applications/Zen.app"
    let personalProfilePath = "~/Library/Application Support/zen/Profiles/zi76byi5.Pesonal"
    
    // Expand the tilde in the path
    let expandedPersonalProfilePath = NSString(string: personalProfilePath).expandingTildeInPath
    
    print("Using personal profile at: \(expandedPersonalProfilePath)")
    
    if fileManager.fileExists(atPath: zenAppPath) {
        do {
            let openZenTask = Process()
            openZenTask.launchPath = "/usr/bin/open"
            
            // Check if the personal profile exists
            if fileManager.fileExists(atPath: expandedPersonalProfilePath) {
                openZenTask.arguments = [zenAppPath, "--args", "--profile", expandedPersonalProfilePath]
                print("Opening Zen Browser with personal profile...")
            } else {
                openZenTask.arguments = [zenAppPath]
                print("Personal profile not found. Opening Zen Browser with default profile...")
            }
            
            try openZenTask.run()
            openZenTask.waitUntilExit()
            
            if openZenTask.terminationStatus == 0 {
                print("Zen Browser opened successfully with personal profile.")
            } else {
                print("Zen Browser exited with status \(openZenTask.terminationStatus).")
            }
        } catch {
            print("Failed to open Zen Browser: \(error)")
            exit(1)
        }
    } else {
        print("Error: Zen Browser application not found at '\(zenAppPath)'.")
        print("Please ensure Zen Browser is installed at the correct location.")
        exit(1)
    }
}
