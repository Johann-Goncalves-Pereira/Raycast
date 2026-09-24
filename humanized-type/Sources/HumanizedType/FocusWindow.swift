import ApplicationServices
import CoreGraphics
import Foundation
import os

/// Quartz window id for an accessibility element.
enum FocusWindow {
    private typealias GetWindow = @convention(c) (AXUIElement, UnsafeMutablePointer<UInt32>) -> AXError

    private static let getWindow: GetWindow? = {
        guard let symbol = dlsym(dlopen(nil, RTLD_NOW), "_AXUIElementGetWindow") else {
            return nil
        }
        return unsafeBitCast(symbol, to: GetWindow.self)
    }()

    static func id(of element: AXUIElement) -> UInt32? {
        guard let getWindow else {
            return nil
        }
        var windowID: UInt32 = 0
        guard getWindow(element, &windowID) == .success, windowID != 0 else {
            return nil
        }
        return windowID
    }

    static func focusedWindowID(pid: pid_t) -> UInt32? {
        let app = AXUIElementCreateApplication(pid)
        var windowRef: CFTypeRef?
        let status = AXUIElementCopyAttributeValue(
            app,
            kAXFocusedWindowAttribute as CFString,
            &windowRef
        )
        guard status == .success, let windowRef,
              CFGetTypeID(windowRef) == AXUIElementGetTypeID()
        else {
            return nil
        }
        let window = unsafeBitCast(windowRef, to: AXUIElement.self)
        return id(of: window)
    }

    /// Frontmost normal window on the active desktop. This updates when you change Spaces.
    static func onScreenFront() -> (pid: pid_t, windowID: UInt32)? {
        let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
        guard let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return nil
        }
        let ownPID = ProcessInfo.processInfo.processIdentifier
        for window in info {
            let layer = window[kCGWindowLayer as String] as? Int ?? 1
            guard layer == 0 else {
                continue
            }
            guard let owner = window[kCGWindowOwnerPID as String] as? Int,
                  let number = window[kCGWindowNumber as String] as? UInt32,
                  owner > 0,
                  pid_t(owner) != ownPID
            else {
                continue
            }
            return (pid_t(owner), number)
        }
        return nil
    }
}

/// Active tab URL for browsers whose accessibility tree hides the document URL.
enum BrowserLocation {
    private static let chromium: [String: String] = [
        "com.google.Chrome": "Google Chrome",
        "com.google.Chrome.canary": "Google Chrome Canary",
        "company.thebrowser.Browser": "Arc",
        "com.brave.Browser": "Brave Browser",
        "com.microsoft.edgemac": "Microsoft Edge",
    ]

    private static let cache = OSAllocatedUnfairLock<(bundle: String, url: String, at: Date)?>(
        initialState: nil
    )

    static func activeURL(bundleIdentifier: String?) -> String {
        guard let bundleIdentifier else {
            return ""
        }
        let cached = cache.withLock { $0 }
        if let cached, cached.bundle == bundleIdentifier,
           Date().timeIntervalSince(cached.at) < 0.08 {
            return cached.url
        }
        let url: String
        if bundleIdentifier == "com.apple.Safari" {
            url = run(script: "tell application \"Safari\" to get URL of current tab of front window")
        } else if let name = chromium[bundleIdentifier] {
            url = run(
                script: "tell application \"\(name)\" to get URL of active tab of front window"
            )
        } else {
            return ""
        }
        cache.withLock { $0 = (bundleIdentifier, url, Date()) }
        return url
    }

    private static func run(script: String) -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return ""
        }
        guard process.terminationStatus == 0 else {
            return ""
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
