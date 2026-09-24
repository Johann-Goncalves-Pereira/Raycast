import Foundation

/// Optional AX frame used only when title and URL are empty.
public struct FocusFrame: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    public func isClose(to other: FocusFrame, tolerance: Double = 2) -> Bool {
        abs(x - other.x) < tolerance
            && abs(y - other.y) < tolerance
            && abs(width - other.width) < tolerance
            && abs(height - other.height) < tolerance
    }
}

/// Snapshot of the focused field. Live typing also requires the same AX element
/// (or the same frame when that element is re-fetched).
public struct FocusFingerprint: Equatable, Sendable {
    public var pid: Int32
    public var role: String
    public var windowTitle: String
    public var documentURL: String
    public var frame: FocusFrame?
    /// Quartz window id of the field's window. Nil when the system did not report one.
    public var windowID: UInt32?

    public init(
        pid: Int32,
        role: String,
        windowTitle: String = "",
        documentURL: String = "",
        frame: FocusFrame? = nil,
        windowID: UInt32? = nil
    ) {
        self.pid = pid
        self.role = role
        self.windowTitle = windowTitle
        self.documentURL = documentURL
        self.frame = frame
        self.windowID = windowID
    }

    /// True when pid, role, window title, URL, and frame still describe one field.
    /// A generic element title does not match a different parent-window title.
    public func matches(_ other: FocusFingerprint) -> Bool {
        guard pid == other.pid else { return false }
        if !role.isEmpty, !other.role.isEmpty, role != other.role {
            return false
        }
        if !documentURL.isEmpty, !other.documentURL.isEmpty, documentURL != other.documentURL {
            return false
        }
        if !Self.sameOptionalText(windowTitle, other.windowTitle) {
            return false
        }
        if let lhs = windowID, let rhs = other.windowID, lhs != rhs {
            return false
        }
        if let lhs = frame, let rhs = other.frame {
            return lhs.isClose(to: rhs)
        }
        return true
    }

    private static func sameOptionalText(_ lhs: String, _ rhs: String) -> Bool {
        if lhs.isEmpty, rhs.isEmpty {
            return true
        }
        return lhs == rhs
    }

    /// Keystrokes follow the on-screen window. Another desktop's app is not this field.
    public static func stillOnScreen(
        lockedPID: Int32,
        lockedWindowID: UInt32,
        currentPID: Int32,
        currentWindowID: UInt32
    ) -> Bool {
        lockedPID == currentPID && lockedWindowID == currentWindowID
    }

    /// A nearby frame is not the same field. The captured element has to match.
    public static func stillOnField(
        frontmostPIDMatches: Bool,
        fingerprintMatches: Bool,
        elementEqual: Bool,
        windowIDMatches: Bool
    ) -> Bool {
        frontmostPIDMatches && fingerprintMatches && elementEqual && windowIDMatches
    }
}
