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

    public init(
        pid: Int32,
        role: String,
        windowTitle: String = "",
        documentURL: String = "",
        frame: FocusFrame? = nil
    ) {
        self.pid = pid
        self.role = role
        self.windowTitle = windowTitle
        self.documentURL = documentURL
        self.frame = frame
    }

    /// True when pid, role, window title, URL, and frame still describe one field.
    /// A generic element title does not match a different parent-window title.
    public func matches(_ other: FocusFingerprint) -> Bool {
        guard pid == other.pid else { return false }
        if !role.isEmpty, !other.role.isEmpty, role != other.role {
            return false
        }
        if !Self.sameOptionalText(documentURL, other.documentURL) {
            return false
        }
        if !Self.sameOptionalText(windowTitle, other.windowTitle) {
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

    /// A nearby frame is not the same field. The captured element has to match.
    public static func stillOnField(
        frontmostPIDMatches: Bool,
        fingerprintMatches: Bool,
        elementEqual: Bool
    ) -> Bool {
        frontmostPIDMatches && fingerprintMatches && elementEqual
    }
}
