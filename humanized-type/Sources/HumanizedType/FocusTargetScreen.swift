import AppKit
import ApplicationServices
import Foundation
import HumanizedTypeCore

extension FocusTarget {
    private static var didLogMismatch = false

    /// True only while this desktop's front window is still the locked browser window.
    func isCurrentlyFocused() -> Bool {
        guard let screen = FocusWindow.onScreenFront() else {
            Self.logMismatch("no on-screen window")
            return false
        }
        guard FocusFingerprint.stillOnScreen(
            lockedPID: pid,
            lockedWindowID: onScreenWindowID,
            currentPID: screen.pid,
            currentWindowID: screen.windowID
        ) else {
            Self.logMismatch(
                "screen changed pid=\(screen.pid) window=\(screen.windowID) " +
                    "locked pid=\(pid) window=\(onScreenWindowID)"
            )
            return false
        }
        let frontmostMatches = NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
        let windowMatches = Self.windowStillMatches(lockedID: fingerprint.windowID, pid: pid)
        guard let current = Self.captureBestFocused(verbose: false) else {
            Self.logMismatch("no-focused-element front=\(frontmostMatches) window=\(windowMatches)")
            return false
        }
        let elementEqual = CFEqual(current.element, element)
        let fingerprintMatches = fingerprint.matches(current.fingerprint)
        let focused = FocusFingerprint.stillOnField(
            frontmostPIDMatches: frontmostMatches,
            fingerprintMatches: fingerprintMatches,
            elementEqual: elementEqual,
            windowIDMatches: windowMatches
        )
        if !focused {
            let frontID = FocusWindow.focusedWindowID(pid: pid).map(String.init) ?? "nil"
            Self.logMismatch(
                "front=\(frontmostMatches) window=\(windowMatches) " +
                    "element=\(elementEqual) fingerprint=\(fingerprintMatches) " +
                    "now=\(current.description) lockedWindow=\(fingerprint.windowID.map(String.init) ?? "nil") " +
                    "frontWindow=\(frontID)"
            )
        }
        return focused
    }

    private static func logMismatch(_ message: String) {
        if didLogMismatch {
            return
        }
        didLogMismatch = true
        RunLog.info("focus mismatch \(message)")
    }

    private static func windowStillMatches(lockedID: UInt32?, pid: pid_t) -> Bool {
        guard let lockedID else {
            return true
        }
        guard let current = FocusWindow.focusedWindowID(pid: pid) else {
            return false
        }
        return current == lockedID
    }
}
