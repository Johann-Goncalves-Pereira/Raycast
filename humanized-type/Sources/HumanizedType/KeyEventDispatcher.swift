import AppKit
import CoreGraphics
import Foundation
import HumanizedTypeCore

/// Posts HID-level keyboard events via CoreGraphics.
enum KeyEventDispatcher {
    /// Carbon virtual key codes (Delete / Return / Tab).
    private static let keyDelete: CGKeyCode = 0x33
    private static let keyReturn: CGKeyCode = 0x24
    private static let keyTab: CGKeyCode = 0x30

    private static let source = CGEventSource(stateID: .hidSystemState)

    /// Returns false when CoreGraphics refuses to create the event.
    @discardableResult
    static func post(event: ScheduledKeyEvent) -> Bool {
        if source == nil {
            return false
        }
        if event.key == KeyboardTopology.backspaceToken {
            return postVirtualKey(keyDelete, keyDown: event.phase == .down)
        }

        guard let character = event.key.first else { return false }

        switch character {
        case "\n", "\r":
            return postVirtualKey(keyReturn, keyDown: event.phase == .down)
        case "\t":
            return postVirtualKey(keyTab, keyDown: event.phase == .down)
        default:
            return postUnicode(String(character), keyDown: event.phase == .down)
        }
    }

    private static func postVirtualKey(_ keyCode: CGKeyCode, keyDown: Bool) -> Bool {
        guard let event = CGEvent(
            keyboardEventSource: source,
            virtualKey: keyCode,
            keyDown: keyDown
        ) else {
            return false
        }
        stampSynthetic(event)
        event.post(tap: .cghidEventTap)
        return true
    }

    private static func postUnicode(_ string: String, keyDown: Bool) -> Bool {
        // Unicode injection works on key-down; key-up still required for pairing.
        guard let event = CGEvent(
            keyboardEventSource: source,
            virtualKey: 0,
            keyDown: keyDown
        ) else {
            return false
        }

        var utf16 = Array(string.utf16)
        utf16.withUnsafeMutableBufferPointer { buffer in
            if let base = buffer.baseAddress {
                event.keyboardSetUnicodeString(
                    stringLength: buffer.count,
                    unicodeString: base
                )
            }
        }
        stampSynthetic(event)
        event.post(tap: .cghidEventTap)
        return true
    }

    private static func stampSynthetic(_ event: CGEvent) {
        event.setIntegerValueField(
            .eventSourceUserData,
            value: UserKeyAbortMonitor.syntheticUserData
        )
    }
}
