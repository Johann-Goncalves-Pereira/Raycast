import AppKit
import ApplicationServices
import Foundation

/// Captures the focused AX element at start and re-focuses it before keystrokes
/// so typing stays locked even if the user clicks elsewhere.
struct FocusTarget {
    var appElement: AXUIElement
    var element: AXUIElement
    var pid: pid_t
    var role: String
    var description: String

    private static let raycastBundleIds: Set<String> = [
        "com.raycast.macos",
        "com.raycast.macos.development",
    ]

    private static let rejectedRoles: Set<String> = [
        "AXApplication",
        "AXSystemWide",
    ]

    /// Wait until Raycast is gone, then poll for a usable focused element.
    static func captureAfterRaycastDismisses(
        timeoutMs: Double = 3_000
    ) -> FocusTarget? {
        let deadline = Date().addingTimeInterval(timeoutMs / 1_000.0)

        while Date() < deadline {
            if isOwnOrRaycastFrontmost() {
                Thread.sleep(forTimeInterval: 0.05)
                continue
            }

            if let target = captureBestFocused() {
                RunLog.info("focus capture ok \(target.description)")
                return target
            }

            let front = NSWorkspace.shared.frontmostApplication
            let name = front?.localizedName ?? "nil"
            RunLog.info("focus capture retry frontmost=\(name)")
            Thread.sleep(forTimeInterval: 0.08)
        }

        return captureBestFocused()
    }

    static func captureBestFocused() -> FocusTarget? {
        if let system = captureFromSystemWide(), isAcceptable(system) {
            return system
        }
        if let appFocused = captureFromFrontmostApp(), isAcceptable(appFocused) {
            return appFocused
        }
        // Last resort: accept whatever focused element we got, even if role is odd.
        return captureFromSystemWide() ?? captureFromFrontmostApp()
    }

    static func captureFromSystemWide() -> FocusTarget? {
        let system = AXUIElementCreateSystemWide()
        return elementFromFocusedAttribute(of: system, source: "system")
    }

    static func captureFromFrontmostApp() -> FocusTarget? {
        guard let front = NSWorkspace.shared.frontmostApplication else {
            return nil
        }
        let pid = front.processIdentifier
        if isOwnOrRaycast(pid: pid, bundleId: front.bundleIdentifier) {
            return nil
        }
        let appElement = AXUIElementCreateApplication(pid)
        return elementFromFocusedAttribute(of: appElement, source: "app:\(pid)")
    }

    private static func elementFromFocusedAttribute(
        of root: AXUIElement,
        source: String
    ) -> FocusTarget? {
        var focusedRef: CFTypeRef?
        let focusStatus = AXUIElementCopyAttributeValue(
            root,
            kAXFocusedUIElementAttribute as CFString,
            &focusedRef
        )
        guard focusStatus == .success, let focusedRef else {
            RunLog.info("focus \(source) status=\(focusStatus.rawValue) empty")
            return nil
        }
        guard CFGetTypeID(focusedRef) == AXUIElementGetTypeID() else {
            RunLog.info("focus \(source) not an AXUIElement")
            return nil
        }
        let element = unsafeBitCast(focusedRef, to: AXUIElement.self)

        var pid: pid_t = 0
        guard AXUIElementGetPid(element, &pid) == .success, pid != 0 else {
            return nil
        }
        if isOwnOrRaycast(pid: pid, bundleId: nil) {
            return nil
        }

        let appElement = AXUIElementCreateApplication(pid)
        let role = stringAttribute(element, kAXRoleAttribute as String) ?? "unknown"
        let title = stringAttribute(element, kAXTitleAttribute as String)
            ?? stringAttribute(element, kAXDescriptionAttribute as String)
            ?? ""
        let description = "source=\(source) pid=\(pid) role=\(role) title=\(title)"
        RunLog.info("focus candidate \(description)")

        return FocusTarget(
            appElement: appElement,
            element: element,
            pid: pid,
            role: role,
            description: description
        )
    }

    private static func isAcceptable(_ target: FocusTarget) -> Bool {
        if rejectedRoles.contains(target.role) {
            return false
        }
        // Prefer text-like roles, but allow unknown web/custom roles.
        let preferredPrefixes = ["AXText", "AXCombo", "AXSearch", "AXWeb", "AXGroup"]
        if preferredPrefixes.contains(where: { target.role.hasPrefix($0) }) {
            return true
        }
        // Many editors report AXTextArea / AXTextField; also accept focused generic.
        return target.role != "unknown"
    }

    /// Activate the target app and restore keyboard focus to the captured element.
    @discardableResult
    func refocus() -> Bool {
        guard let app = NSRunningApplication(processIdentifier: pid) else {
            return false
        }
        _ = app.activate(options: [.activateIgnoringOtherApps])

        let setFocused = AXUIElementSetAttributeValue(
            element,
            kAXFocusedAttribute as CFString,
            kCFBooleanTrue
        )
        if setFocused == .success {
            return true
        }

        let setAppFocused = AXUIElementSetAttributeValue(
            appElement,
            kAXFocusedUIElementAttribute as CFString,
            element
        )
        return setAppFocused == .success
    }

    private static func isOwnOrRaycastFrontmost() -> Bool {
        guard let front = NSWorkspace.shared.frontmostApplication else {
            return false
        }
        return isOwnOrRaycast(pid: front.processIdentifier, bundleId: front.bundleIdentifier)
    }

    private static func isOwnOrRaycast(pid: pid_t, bundleId: String?) -> Bool {
        if pid == ProcessInfo.processInfo.processIdentifier {
            return true
        }
        if let bundleId, raycastBundleIds.contains(bundleId) {
            return true
        }
        if let app = NSRunningApplication(processIdentifier: pid),
           let name = app.localizedName?.lowercased(),
           name.contains("raycast") {
            return true
        }
        return false
    }

    private static func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
        var value: CFTypeRef?
        let status = AXUIElementCopyAttributeValue(element, name as CFString, &value)
        guard status == .success, let value else { return nil }
        return value as? String
    }
}
