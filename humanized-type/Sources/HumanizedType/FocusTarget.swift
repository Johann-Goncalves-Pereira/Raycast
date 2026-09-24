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

    /// Wait until Raycast / this binary is not frontmost, then capture focus.
    static func captureAfterRaycastDismisses(
        timeoutMs: Double = 1_500
    ) -> FocusTarget? {
        let deadline = Date().addingTimeInterval(timeoutMs / 1_000.0)
        while Date() < deadline {
            if !isOwnOrRaycastFrontmost() {
                break
            }
            Thread.sleep(forTimeInterval: 0.05)
        }
        // Brief settle so the previous app restores focus.
        Thread.sleep(forTimeInterval: 0.12)
        return captureFocused()
    }

    static func captureFocused() -> FocusTarget? {
        let system = AXUIElementCreateSystemWide()
        var focusedRef: CFTypeRef?
        let focusStatus = AXUIElementCopyAttributeValue(
            system,
            kAXFocusedUIElementAttribute as CFString,
            &focusedRef
        )
        guard focusStatus == .success, let focusedRef else {
            return nil
        }
        guard CFGetTypeID(focusedRef) == AXUIElementGetTypeID() else {
            return nil
        }
        let element = unsafeBitCast(focusedRef, to: AXUIElement.self)

        var pid: pid_t = 0
        guard AXUIElementGetPid(element, &pid) == .success, pid != 0 else {
            return nil
        }

        let appElement = AXUIElementCreateApplication(pid)
        let role = stringAttribute(element, kAXRoleAttribute as String) ?? "unknown"
        let title = stringAttribute(element, kAXTitleAttribute as String)
            ?? stringAttribute(element, kAXDescriptionAttribute as String)
            ?? ""
        let description = "pid=\(pid) role=\(role) title=\(title)"

        return FocusTarget(
            appElement: appElement,
            element: element,
            pid: pid,
            role: role,
            description: description
        )
    }

    /// Activate the target app and restore keyboard focus to the captured element.
    @discardableResult
    func refocus() -> Bool {
        guard let app = NSRunningApplication(processIdentifier: pid) else {
            return false
        }
        let activated = app.activate(options: [.activateIgnoringOtherApps])
        if !activated {
            // Still try AX focus; some apps report false even when usable.
        }

        // Prefer focusing the saved element itself.
        let setFocused = AXUIElementSetAttributeValue(
            element,
            kAXFocusedAttribute as CFString,
            kCFBooleanTrue
        )
        if setFocused == .success {
            return true
        }

        // Fallback: ask the application to focus this UI element.
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
        if front.processIdentifier == ProcessInfo.processInfo.processIdentifier {
            return true
        }
        if let bundle = front.bundleIdentifier, raycastBundleIds.contains(bundle) {
            return true
        }
        let name = front.localizedName?.lowercased() ?? ""
        if name.contains("raycast") { return true }
        return false
    }

    private static func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
        var value: CFTypeRef?
        let status = AXUIElementCopyAttributeValue(element, name as CFString, &value)
        guard status == .success, let value else { return nil }
        return value as? String
    }
}
