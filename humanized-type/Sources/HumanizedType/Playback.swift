import Foundation
import HumanizedTypeCore

extension HumanizedTypeMain {
    static func play(
        events: [ScheduledKeyEvent],
        target: FocusTarget
    ) -> Int {
        guard let first = events.first else {
            RunLog.fail("scheduler produced zero events")
            return 0
        }
        let originMs = first.timestampMs
        var startNs = PrecisionClock.nowNs()
        var posted = 0
        var failures = 0
        var didNotifyPause = false
        var didNotifyAbort = false
        let progressEvery = 25
        let abortMonitor = UserKeyAbortMonitor.shared
        abortMonitor.start()
        defer { abortMonitor.stop() }

        func stopIfUserKey() -> Bool {
            guard abortMonitor.isAborted else { return false }
            if !didNotifyAbort {
                didNotifyAbort = true
                RunLog.info("aborted: key pressed")
                notify("Humanized Type stopped (key pressed)")
            }
            return true
        }

        for (index, event) in events.enumerated() {
            if stopIfUserKey() {
                break
            }

            let offsetMs = max(0, event.timestampMs - originMs)
            let offsetNs = UInt64(offsetMs * 1_000_000.0)
            let deadlineNs = startNs &+ offsetNs
            PrecisionClock.sleepUntil(deadlineNs: deadlineNs)

            if stopIfUserKey() {
                break
            }

            if event.phase == .down, !target.isCurrentlyFocused() {
                if !didNotifyPause {
                    didNotifyPause = true
                    RunLog.info("paused: focus left target field \(target.description)")
                    notify(
                        """
                        Typing paused. Return to the original field to continue, \
                        or press any key there to stop.
                        """
                    )
                }
                while !target.isCurrentlyFocused(), !abortMonitor.isAborted {
                    PrecisionClock.sleep(milliseconds: 100)
                }
                if stopIfUserKey() {
                    break
                }
                startNs = PrecisionClock.nowNs() &- offsetNs
                RunLog.info("resumed: focus returned to target field")
                didNotifyPause = false
            }

            if KeyEventDispatcher.post(event: event) {
                posted += 1
                if posted == 1 {
                    RunLog.info("first keystroke key=\(event.key) phase=\(event.phase.rawValue)")
                }
            } else {
                failures += 1
                if failures == 1 {
                    RunLog.fail(
                        "CGEvent post failed for key=\(event.key) phase=\(event.phase.rawValue)"
                    )
                }
            }
            if (index + 1) % progressEvery == 0 {
                RunLog.info("progress \(index + 1)/\(events.count) posted=\(posted)")
            }
        }

        if failures > 0 {
            RunLog.fail("CGEvent failures=\(failures) posted=\(posted)")
        }
        return posted
    }

    /// When AXValue is readable, backspace a mismatched tail and retype the correct one.
    static func repairFieldIfNeeded(target: FocusTarget, sourceText: String) {
        guard let expected = target.expectedValue(afterTyping: sourceText) else {
            RunLog.info("end-repair skipped: AXValue unavailable")
            return
        }
        guard target.isCurrentlyFocused() else {
            RunLog.info("end-repair skipped: focus left target")
            return
        }
        guard let actual = target.readTextSnapshot()?.fullValue else {
            RunLog.info("end-repair skipped: could not re-read AXValue")
            return
        }
        if actual == expected {
            RunLog.info("end-repair ok: field matches source")
            return
        }

        let common = commonPrefixLength(actual, expected)
        let deleteCount = actual.count - common
        let missing = String(expected.dropFirst(common))
        RunLog.info("end-repair mismatch delete=\(deleteCount) retype=\(missing.count)")

        for _ in 0..<deleteCount {
            postRepairKey(KeyboardTopology.backspaceToken, downMs: 12, upMs: 18)
            if !target.isCurrentlyFocused() {
                RunLog.fail("end-repair aborted: focus left during backspace")
                return
            }
        }

        for character in missing {
            postRepairKey(String(character), downMs: 10, upMs: 14)
            if !target.isCurrentlyFocused() {
                RunLog.fail("end-repair aborted: focus left during retype")
                return
            }
        }

        if let finalValue = target.readTextSnapshot()?.fullValue, finalValue == expected {
            RunLog.info("end-repair complete")
        } else {
            RunLog.fail("end-repair finished but field still mismatches")
        }
    }

    private static func postRepairKey(_ key: String, downMs: Double, upMs: Double) {
        let keyDown = ScheduledKeyEvent(key: key, phase: .down, timestampMs: 0)
        let keyUp = ScheduledKeyEvent(key: key, phase: .keyUp, timestampMs: 0)
        _ = KeyEventDispatcher.post(event: keyDown)
        PrecisionClock.sleep(milliseconds: downMs)
        _ = KeyEventDispatcher.post(event: keyUp)
        PrecisionClock.sleep(milliseconds: upMs)
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
