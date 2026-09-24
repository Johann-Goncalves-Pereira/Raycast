import ApplicationServices
import Foundation

extension FocusTarget {
    /// True when characters can be inserted into this element without following keyboard focus.
    func supportsDirectInsert() -> Bool {
        var settable = DarwinBoolean(false)
        let status = AXUIElementIsAttributeSettable(
            element,
            kAXSelectedTextAttribute as CFString,
            &settable
        )
        guard status == .success, settable.boolValue else {
            RunLog.info("direct insert unavailable status=\(status.rawValue)")
            return false
        }
        guard confirmDirectInsert() else {
            RunLog.info("direct insert ignored by field")
            return false
        }
        RunLog.info("direct insert locked to captured element")
        return true
    }

    /// Inserts into the captured element. Does not move keyboard focus.
    func insertText(_ text: String) -> Bool {
        let status = AXUIElementSetAttributeValue(
            element,
            kAXSelectedTextAttribute as CFString,
            text as CFString
        )
        return status == .success
    }

    /// Deletes one character before the caret in the captured element.
    func deleteBackward() -> Bool {
        guard var range = selectedRange() else {
            return false
        }
        if range.length == 0 {
            guard range.location > 0 else {
                return true
            }
            range.location -= 1
            range.length = 1
            guard setSelectedRange(range) else {
                return false
            }
        }
        return insertText("")
    }

    private func confirmDirectInsert() -> Bool {
        let before = readTextSnapshot()?.fullValue
        guard insertText("\u{2060}") else {
            return false
        }
        let after = readTextSnapshot()?.fullValue
        let landed = before != nil && after != nil && after != before
        guard landed else {
            _ = deleteBackward()
            return false
        }
        return deleteBackward()
    }

    private func selectedRange() -> CFRange? {
        var rangeRef: CFTypeRef?
        let status = AXUIElementCopyAttributeValue(
            element,
            kAXSelectedTextRangeAttribute as CFString,
            &rangeRef
        )
        guard status == .success, let rangeRef,
              CFGetTypeID(rangeRef) == AXValueGetTypeID()
        else {
            return nil
        }
        let axValue = unsafeBitCast(rangeRef, to: AXValue.self)
        var range = CFRange(location: 0, length: 0)
        guard AXValueGetType(axValue) == .cfRange,
              AXValueGetValue(axValue, .cfRange, &range)
        else {
            return nil
        }
        return range
    }

    private func setSelectedRange(_ range: CFRange) -> Bool {
        var copy = range
        guard let value = AXValueCreate(.cfRange, &copy) else {
            return false
        }
        let status = AXUIElementSetAttributeValue(
            element,
            kAXSelectedTextRangeAttribute as CFString,
            value
        )
        return status == .success
    }
}
