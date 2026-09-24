import CoreGraphics
import Foundation
import os

/// Stops typing when the user presses a real key. Synthetic posts are ignored.
final class UserKeyAbortMonitor: @unchecked Sendable {
    static let shared = UserKeyAbortMonitor()
    /// Marker stamped on events this process posts.
    static let syntheticUserData: Int64 = 0x4854_5950

    private let aborted = OSAllocatedUnfairLock(initialState: false)
    private let targetFocused = OSAllocatedUnfairLock(initialState: false)
    private var tapPort: CFMachPort?
    private var runLoop: CFRunLoop?

    private init() {}

    var isAborted: Bool {
        aborted.withLock { $0 }
    }

    /// Keys outside the locked field must not stop the run.
    func setTargetFocused(_ focused: Bool) {
        targetFocused.withLock { $0 = focused }
    }

    func start() {
        aborted.withLock { $0 = false }
        let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
        let info = Unmanaged.passUnretained(self).toOpaque()
        guard let created = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: Self.handleEvent,
            userInfo: info
        ) else {
            RunLog.fail("user-key tap unavailable; press Raycast hotkey to cancel")
            return
        }
        tapPort = created
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, created, 0)
        let thread = Thread {
            self.runLoop = CFRunLoopGetCurrent()
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
            CGEvent.tapEnable(tap: created, enable: true)
            CFRunLoopRun()
        }
        thread.name = "humanized-type-key-abort"
        thread.start()
    }

    func stop() {
        if let runLoop {
            CFRunLoopStop(runLoop)
        }
        tapPort = nil
        runLoop = nil
    }

    private func markAborted() {
        aborted.withLock { $0 = true }
    }

    private static let handleEvent: CGEventTapCallBack = { _, type, event, userInfo in
        guard let userInfo else {
            return Unmanaged.passUnretained(event)
        }
        let monitor = Unmanaged<UserKeyAbortMonitor>
            .fromOpaque(userInfo)
            .takeUnretainedValue()
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tapPort = monitor.tapPort {
                CGEvent.tapEnable(tap: tapPort, enable: true)
            }
            return Unmanaged.passUnretained(event)
        }
        let marker = event.getIntegerValueField(.eventSourceUserData)
        let onTarget = monitor.targetFocused.withLock { $0 }
        if onTarget, marker != UserKeyAbortMonitor.syntheticUserData {
            monitor.markAborted()
        }
        return Unmanaged.passUnretained(event)
    }
}
