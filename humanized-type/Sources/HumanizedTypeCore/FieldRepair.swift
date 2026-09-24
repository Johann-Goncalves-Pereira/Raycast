import Foundation

/// How to correct a field whose `AXValue` drifted from the source text.
public enum FieldRepairDecision: Equatable, Sendable {
    case matches
    case skipTooLarge(deleteCount: Int, retypeCount: Int)
    case repair(deleteCount: Int, retype: String)

    /// Rewrites longer than this are left alone. Web editors often expose a
    /// misleading `AXValue`, and a long backspace pass would damage the field.
    public static let maxSuffix = 32

    public static func decide(actual: String, expected: String) -> FieldRepairDecision {
        if actual == expected {
            return .matches
        }
        let common = commonPrefixLength(actual, expected)
        let deleteCount = actual.count - common
        let retype = String(expected.dropFirst(common))
        if deleteCount > maxSuffix || retype.count > maxSuffix {
            return .skipTooLarge(deleteCount: deleteCount, retypeCount: retype.count)
        }
        return .repair(deleteCount: deleteCount, retype: retype)
    }

    private static func commonPrefixLength(_ lhs: String, _ rhs: String) -> Int {
        let left = Array(lhs)
        let right = Array(rhs)
        let limit = min(left.count, right.count)
        var index = 0
        while index < limit, left[index] == right[index] {
            index += 1
        }
        return index
    }
}
