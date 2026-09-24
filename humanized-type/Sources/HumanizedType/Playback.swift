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
        let directInsert = target.supportsDirectInsert()
        abortMonitor.start()
        abortMonitor.setTargetFocused(true)
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

            if directInsert, event.phase == .down {
                abortMonitor.setTargetFocused(target.isCurrentlyFocused())
            }

            if !directInsert, event.phase == .down, !target.isCurrentlyFocused() {
                startNs = waitUntilFieldReturns(
                    target: target,
                    abortMonitor: abortMonitor,
                    didNotifyPause: &didNotifyPause,
                    offsetNs: offsetNs
                )
                if stopIfUserKey() {
                    break
                }
            }

            if deliver(event: event, target: target, directInsert: directInsert) {
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

    private static func waitUntilFieldReturns(
        target: FocusTarget,
        abortMonitor: UserKeyAbortMonitor,
        didNotifyPause: inout Bool,
        offsetNs: UInt64
    ) -> UInt64 {
        abortMonitor.setTargetFocused(false)
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
        while !target.isCurrentlyFocused() {
            PrecisionClock.sleep(milliseconds: 100)
        }
        abortMonitor.setTargetFocused(true)
        RunLog.info("resumed: focus returned to target field")
        didNotifyPause = false
        return PrecisionClock.nowNs() &- offsetNs
    }

    private static func deliver(
        event: ScheduledKeyEvent,
        target: FocusTarget,
        directInsert: Bool
    ) -> Bool {
        guard directInsert else {
            return KeyEventDispatcher.post(event: event)
        }
        guard event.phase == .down else {
            return true
        }
        if event.key == KeyboardTopology.backspaceToken {
            return target.deleteBackward()
        }
        return target.insertText(event.key)
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

        switch FieldRepairDecision.decide(actual: actual, expected: expected) {
        case .matches:
            RunLog.info("end-repair ok: field matches source")
            return
        case .skipTooLarge(let deleteCount, let retypeCount):
            RunLog.info(
                "end-repair skipped: mismatch too large delete=\(deleteCount) retype=\(retypeCount)"
            )
            return
        case .repair(let deleteCount, let missing):
            applyRepair(
                target: target,
                deleteCount: deleteCount,
                missing: missing,
                expected: expected
            )
        }
    }

    private static func applyRepair(
        target: FocusTarget,
        deleteCount: Int,
        missing: String,
        expected: String
    ) {
        RunLog.info("end-repair mismatch delete=\(deleteCount) retype=\(missing.count)")

        for _ in 0..<deleteCount {
            guard target.deleteBackward() else {
                RunLog.fail("end-repair aborted: backspace failed on locked field")
                return
            }
        }

        for character in missing {
            guard target.insertText(String(character)) else {
                RunLog.fail("end-repair aborted: insert failed on locked field")
                return
            }
        }

        if let finalValue = target.readTextSnapshot()?.fullValue, finalValue == expected {
            RunLog.info("end-repair complete")
        } else {
            RunLog.fail("end-repair finished but field still mismatches")
        }
    }

}
