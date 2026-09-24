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

/// Pure identity of a focused text field for pause/resume matching.
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

    /// True when the currently focused element is the same field we started on.
    public func matches(_ other: FocusFingerprint) -> Bool {
        guard pid == other.pid else { return false }
        if !role.isEmpty, !other.role.isEmpty, role != other.role {
            return false
        }
        if !documentURL.isEmpty || !other.documentURL.isEmpty {
            return documentURL == other.documentURL
        }
        if !windowTitle.isEmpty || !other.windowTitle.isEmpty {
            return windowTitle == other.windowTitle
        }
        if let lhs = frame, let rhs = other.frame {
            return lhs.isClose(to: rhs)
        }
        return role == other.role
    }
}
