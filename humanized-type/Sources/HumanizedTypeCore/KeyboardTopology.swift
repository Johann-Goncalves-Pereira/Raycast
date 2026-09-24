import Foundation

/// Hand assignment for home-row touch typing.
public enum TypingHand: Int, Sendable, Equatable {
    case left = 0
    case right = 1
}

/// Anatomical digit index: 1 = thumb … 5 = pinky.
public enum TypingFinger: Int, Sendable, Equatable, CaseIterable {
    case thumb = 1
    case index = 2
    case middle = 3
    case ring = 4
    case pinky = 5

    /// Digraph execution relative velocity / \(M_f\) from Module 2.
    public var speedFactor: Double {
        switch self {
        case .thumb: return 0.95
        case .index: return 1.00
        case .middle: return 0.91
        case .ring: return 0.74
        case .pinky: return 0.62
        }
    }
}

/// Physical keycap location and motor assignment.
public struct KeyTopology: Sendable, Equatable {
    public var xMm: Double
    public var yMm: Double
    public var hand: TypingHand
    public var finger: TypingFinger

    public init(xMm: Double, yMm: Double, hand: TypingHand, finger: TypingFinger) {
        self.xMm = xMm
        self.yMm = yMm
        self.hand = hand
        self.finger = finger
    }

    public func distance(to other: KeyTopology) -> Double {
        let deltaX = other.xMm - xMm
        let deltaY = other.yMm - yMm
        return (deltaX * deltaX + deltaY * deltaY).squareRoot()
    }
}

/// ANSI QWERTY 2D coordinate matrix with staggered rows and finger map (Module 2 / 6).
public enum KeyboardTopology {
    public static let pitchMm: Double = 19.05

    /// Logical key for backspace in the matrix (not a typed character).
    public static let backspaceToken = "BS"

    private static let matrix: [String: KeyTopology] = buildMatrix()

    /// Neutral home-row fallback (right index on `j`).
    public static let fallbackKey = "j"

    public static func topology(for character: Character) -> KeyTopology {
        topology(for: String(character))
    }

    public static func topology(for token: String) -> KeyTopology {
        if token == backspaceToken, let backspace = matrix[backspaceToken] {
            return backspace
        }
        let lowered = token.lowercased()
        if let found = matrix[lowered] {
            return found
        }
        if let first = lowered.first, let found = matrix[String(first)] {
            return found
        }
        // Module 6: neutral home-row fallback
        if let fallback = matrix[fallbackKey] {
            return fallback
        }
        return KeyTopology(
            xMm: 7.75 * pitchMm,
            yMm: 2.0 * pitchMm,
            hand: .right,
            finger: .index
        )
    }

    /// All letter/digit keys used for neighbor search (excludes space / BS).
    public static var neighborSearchKeys: [String] {
        matrix.keys.filter { key in
            key != " " && key != backspaceToken && key.count == 1
        }
    }

    public static func isMapped(_ character: Character) -> Bool {
        let token = String(character)
        return matrix[token.lowercased()] != nil || matrix[token] != nil
    }

    private static func buildMatrix() -> [String: KeyTopology] {
        let p = pitchMm
        func key(
            _ x: Double,
            _ y: Double,
            _ hand: TypingHand,
            _ finger: TypingFinger
        ) -> KeyTopology {
            KeyTopology(xMm: x * p, yMm: y * p, hand: hand, finger: finger)
        }

        var map: [String: KeyTopology] = [:]

        // Row 1 (number row)
        map["`"] = key(0.00, 0.0, .left, .pinky)
        map["1"] = key(1.00, 0.0, .left, .pinky)
        map["2"] = key(2.00, 0.0, .left, .ring)
        map["3"] = key(3.00, 0.0, .left, .middle)
        map["4"] = key(4.00, 0.0, .left, .index)
        map["5"] = key(5.00, 0.0, .left, .index)
        map["6"] = key(6.00, 0.0, .right, .index)
        map["7"] = key(7.00, 0.0, .right, .index)
        map["8"] = key(8.00, 0.0, .right, .middle)
        map["9"] = key(9.00, 0.0, .right, .ring)
        map["0"] = key(10.0, 0.0, .right, .pinky)
        map["-"] = key(11.0, 0.0, .right, .pinky)
        map["="] = key(12.0, 0.0, .right, .pinky)

        // Row 2 (QWERTY) — offset 0.5 pitch
        map["q"] = key(1.50, 1.0, .left, .pinky)
        map["w"] = key(2.50, 1.0, .left, .ring)
        map["e"] = key(3.50, 1.0, .left, .middle)
        map["r"] = key(4.50, 1.0, .left, .index)
        map["t"] = key(5.50, 1.0, .left, .index)
        map["y"] = key(6.50, 1.0, .right, .index)
        map["u"] = key(7.50, 1.0, .right, .index)
        map["i"] = key(8.50, 1.0, .right, .middle)
        map["o"] = key(9.50, 1.0, .right, .ring)
        map["p"] = key(10.5, 1.0, .right, .pinky)
        map["["] = key(11.5, 1.0, .right, .pinky)
        map["]"] = key(12.5, 1.0, .right, .pinky)

        // Row 3 (home) — offset ~0.75 pitch vs row 1
        map["a"] = key(1.75, 2.0, .left, .pinky)
        map["s"] = key(2.75, 2.0, .left, .ring)
        map["d"] = key(3.75, 2.0, .left, .middle)
        map["f"] = key(4.75, 2.0, .left, .index)
        map["g"] = key(5.75, 2.0, .left, .index)
        map["h"] = key(6.75, 2.0, .right, .index)
        map["j"] = key(7.75, 2.0, .right, .index)
        map["k"] = key(8.75, 2.0, .right, .middle)
        map["l"] = key(9.75, 2.0, .right, .ring)
        map[";"] = key(10.75, 2.0, .right, .pinky)
        map["'"] = key(11.75, 2.0, .right, .pinky)

        // Row 4 (ZXCV) — offset ~1.25 pitch vs row 1
        map["z"] = key(2.25, 3.0, .left, .pinky)
        map["x"] = key(3.25, 3.0, .left, .ring)
        map["c"] = key(4.25, 3.0, .left, .middle)
        map["v"] = key(5.25, 3.0, .left, .index)
        map["b"] = key(6.25, 3.0, .left, .index)
        map["n"] = key(7.25, 3.0, .right, .index)
        map["m"] = key(8.25, 3.0, .right, .index)
        map[","] = key(9.25, 3.0, .right, .middle)
        map["."] = key(10.25, 3.0, .right, .ring)
        map["/"] = key(11.25, 3.0, .right, .pinky)

        // Space (right thumb) and Backspace (right pinky)
        map[" "] = key(6.00, 4.0, .right, .thumb)
        map[backspaceToken] = key(13.5, 0.0, .right, .pinky)
        map["\\"] = key(13.5, 1.0, .right, .pinky)

        // Shifted symbol aliases share physical keycaps
        let aliases: [(String, String)] = [
            ("!", "1"), ("@", "2"), ("#", "3"), ("$", "4"), ("%", "5"),
            ("^", "6"), ("&", "7"), ("*", "8"), ("(", "9"), (")", "0"),
            ("_", "-"), ("+", "="), (":", ";"), ("\"", "'"),
            ("<", ","), (">", "."), ("?", "/"), ("~", "`"),
            ("{", "["), ("}", "]"), ("|", "\\"),
        ]
        for (alias, base) in aliases {
            if let topology = map[base] {
                map[alias] = topology
            }
        }

        return map
    }
}
