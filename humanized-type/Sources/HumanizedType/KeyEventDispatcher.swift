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

    static func post(event: ScheduledKeyEvent) {
        if event.key == KeyboardTopology.backspaceToken {
            postVirtualKey(keyDelete, keyDown: event.phase == .down)
            return
        }

        guard let character = event.key.first else { return }

        switch character {
        case "\n", "\r":
            postVirtualKey(keyReturn, keyDown: event.phase == .down)
        case "\t":
            postVirtualKey(keyTab, keyDown: event.phase == .down)
        default:
            postUnicode(String(character), keyDown: event.phase == .down)
        }
    }

    private static func postVirtualKey(_ keyCode: CGKeyCode, keyDown: Bool) {
        guard let event = CGEvent(
            keyboardEventSource: source,
            virtualKey: keyCode,
            keyDown: keyDown
        ) else {
            return
        }
        event.post(tap: .cghidEventTap)
    }

    private static func postUnicode(_ string: String, keyDown: Bool) {
        // Unicode injection works on key-down; key-up still required for pairing.
        guard let event = CGEvent(
            keyboardEventSource: source,
            virtualKey: 0,
            keyDown: keyDown
        ) else {
            return
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
        event.post(tap: .cghidEventTap)
    }
}
