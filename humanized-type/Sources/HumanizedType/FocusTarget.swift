import AppKit
import ApplicationServices
import Foundation
import HumanizedTypeCore

/// Captures the focused AX text field and pauses typing when focus leaves it.
struct FocusTarget {
    var appElement: AXUIElement
    var element: AXUIElement
    var pid: pid_t
    var role: String
    var fingerprint: FocusFingerprint
    var description: String
    /// Snapshot of field text around the caret when AXValue is readable.
    var textSnapshot: TextSnapshot?

    struct TextSnapshot {
        var fullValue: String
        var selectedRange: CFRange
        var prefix: String
        var selection: String
        var suffix: String
    }

    private static let raycastBundleIds: Set<String> = [
        "com.raycast.macos",
        "com.raycast.macos.development",
    ]

    private static let rejectedRoles: Set<String> = [
        "AXApplication",
        "AXSystemWide",
        "AXWindow",
        "AXToolbar",
        "AXMenuBar",
    ]

    private static let preferredRolePrefixes = [
        "AXText",
        "AXCombo",
        "AXSearch",
        "AXWeb",
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

            if let target = captureBestFocused(), isTextLike(target) {
                RunLog.info("focus capture ok \(target.description)")
                return target
            }

            let front = NSWorkspace.shared.frontmostApplication
            let name = front?.localizedName ?? "nil"
            RunLog.info("focus capture retry frontmost=\(name)")
            Thread.sleep(forTimeInterval: 0.08)
        }

        if let target = captureBestFocused(), isTextLike(target) {
            return target
        }
        return nil
    }

    static func captureBestFocused() -> FocusTarget? {
        if let system = captureFromSystemWide(), isAcceptable(system) {
            return system
        }
        if let appFocused = captureFromFrontmostApp(), isAcceptable(appFocused) {
            return appFocused
        }
        return nil
    }

    /// True when the currently focused field matches this target's fingerprint.
    func isCurrentlyFocused() -> Bool {
        guard let current = Self.captureBestFocused() else {
            return false
        }
        return fingerprint.matches(current.fingerprint)
    }

    /// Read AXValue + selection if the field exposes them.
    func readTextSnapshot() -> TextSnapshot? {
        Self.readTextSnapshot(of: element)
    }

    /// Expected full value after typing `source` into the captured selection.
    func expectedValue(afterTyping source: String) -> String? {
        guard let snap = textSnapshot else { return nil }
        return snap.prefix + source + snap.suffix
    }

    private static func captureFromSystemWide() -> FocusTarget? {
        let system = AXUIElementCreateSystemWide()
        return elementFromFocusedAttribute(of: system, source: "system")
    }

    private static func captureFromFrontmostApp() -> FocusTarget? {
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
        let windowTitle = windowTitle(for: element, app: appElement)
        let documentURL = documentURL(for: element, app: appElement)
        let frame = frame(of: element)
        let fingerprint = FocusFingerprint(
            pid: pid,
            role: role,
            windowTitle: windowTitle,
            documentURL: documentURL,
            frame: frame
        )
        let snapshot = readTextSnapshot(of: element)
        let description =
            "source=\(source) pid=\(pid) role=\(role) " +
            "title=\(windowTitle) url=\(documentURL) " +
            "axValue=\(snapshot != nil)"
        RunLog.info("focus candidate \(description)")

        return FocusTarget(
            appElement: appElement,
            element: element,
            pid: pid,
            role: role,
            fingerprint: fingerprint,
            description: description,
            textSnapshot: snapshot
        )
    }

    private static func isAcceptable(_ target: FocusTarget) -> Bool {
        if rejectedRoles.contains(target.role) {
            return false
        }
        return target.role != "unknown"
    }

    private static func isTextLike(_ target: FocusTarget) -> Bool {
        if rejectedRoles.contains(target.role) {
            return false
        }
        if preferredRolePrefixes.contains(where: { target.role.hasPrefix($0) }) {
            return true
        }
        // Accept focused fields that expose editable text.
        return target.textSnapshot != nil
    }

    private static func windowTitle(for element: AXUIElement, app: AXUIElement) -> String {
        if let title = stringAttribute(element, kAXTitleAttribute as String), !title.isEmpty {
            return title
        }
        if let window = parentWindow(of: element),
           let title = stringAttribute(window, kAXTitleAttribute as String),
           !title.isEmpty {
            return title
        }
        var windowsRef: CFTypeRef?
        let status = AXUIElementCopyAttributeValue(
            app,
            kAXWindowsAttribute as CFString,
            &windowsRef
        )
        guard status == .success,
              let windows = windowsRef as? [AXUIElement],
              let first = windows.first,
              let title = stringAttribute(first, kAXTitleAttribute as String)
        else {
            return ""
        }
        return title
    }

    private static func documentURL(for element: AXUIElement, app: AXUIElement) -> String {
        let keys = [
            "AXDocument",
            "AXURL",
            kAXURLAttribute as String,
        ]
        for key in keys {
            if let value = stringAttribute(element, key), !value.isEmpty {
                return value
            }
            if let window = parentWindow(of: element),
               let value = stringAttribute(window, key),
               !value.isEmpty {
                return value
            }
            if let value = stringAttribute(app, key), !value.isEmpty {
                return value
            }
        }
        return ""
    }

    private static func parentWindow(of element: AXUIElement) -> AXUIElement? {
        var current = element
        for _ in 0..<12 {
            var parentRef: CFTypeRef?
            let status = AXUIElementCopyAttributeValue(
                current,
                kAXParentAttribute as CFString,
                &parentRef
            )
            guard status == .success, let parentRef else { return nil }
            guard CFGetTypeID(parentRef) == AXUIElementGetTypeID() else { return nil }
            let parent = unsafeBitCast(parentRef, to: AXUIElement.self)
            let role = stringAttribute(parent, kAXRoleAttribute as String) ?? ""
            if role == "AXWindow" {
                return parent
            }
            current = parent
        }
        return nil
    }

    private static func frame(of element: AXUIElement) -> FocusFrame? {
        var positionRef: CFTypeRef?
        var sizeRef: CFTypeRef?
        let posStatus = AXUIElementCopyAttributeValue(
            element,
            kAXPositionAttribute as CFString,
            &positionRef
        )
        let sizeStatus = AXUIElementCopyAttributeValue(
            element,
            kAXSizeAttribute as CFString,
            &sizeRef
        )
        guard posStatus == .success, sizeStatus == .success,
              let positionRef, let sizeRef,
              CFGetTypeID(positionRef) == AXValueGetTypeID(),
              CFGetTypeID(sizeRef) == AXValueGetTypeID()
        else {
            return nil
        }
        let positionValue = unsafeBitCast(positionRef, to: AXValue.self)
        let sizeValue = unsafeBitCast(sizeRef, to: AXValue.self)
        var point = CGPoint.zero
        var size = CGSize.zero
        guard AXValueGetValue(positionValue, .cgPoint, &point),
              AXValueGetValue(sizeValue, .cgSize, &size)
        else {
            return nil
        }
        return FocusFrame(
            x: Double(point.x),
            y: Double(point.y),
            width: Double(size.width),
            height: Double(size.height)
        )
    }

    private static func readTextSnapshot(of element: AXUIElement) -> TextSnapshot? {
        guard let value = stringAttribute(element, kAXValueAttribute as String) else {
            return nil
        }

        var rangeRef: CFTypeRef?
        let rangeStatus = AXUIElementCopyAttributeValue(
            element,
            kAXSelectedTextRangeAttribute as CFString,
            &rangeRef
        )
        var selected = CFRange(location: 0, length: 0)
        if rangeStatus == .success, let rangeRef {
            // Prefer AXValue CFRange when present.
            let axValue = unsafeBitCast(rangeRef, to: AXValue.self)
            if AXValueGetType(axValue) == .cfRange {
                _ = AXValueGetValue(axValue, .cfRange, &selected)
            }
        }

        let chars = Array(value)
        let start = max(0, min(selected.location, chars.count))
        let end = max(start, min(start + max(selected.length, 0), chars.count))
        let prefix = String(chars[..<start])
        let selection = String(chars[start..<end])
        let suffix = String(chars[end...])
        return TextSnapshot(
            fullValue: value,
            selectedRange: CFRange(location: start, length: end - start),
            prefix: prefix,
            selection: selection,
            suffix: suffix
        )
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
        if let string = value as? String {
            return string
        }
        if let url = value as? URL {
            return url.absoluteString
        }
        return nil
    }
}
