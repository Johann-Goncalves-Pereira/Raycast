import AppKit
import ApplicationServices
import Darwin
import Foundation
import HumanizedTypeCore

@main
enum HumanizedTypeMain {
    /// Soft cap so a huge clipboard cannot run for hours.
    private static let defaultMaxChars = 5_000
    private static let defaultWpm = 190.0
    private static let pidFileURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("humanized-type.pid")

    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        let logTiming = args.contains("--log-timing")
        let dryRun = args.contains("--dry-run")
        let useResearch = args.contains("--research")
        let wpm = parseWpm(from: args) ?? defaultWpm
        let maxChars = parseMaxChars(from: args) ?? defaultMaxChars
        let inputFile = parseValue(after: "--input-file", in: args)

        if handleCancelIfAlreadyRunning() {
            exit(0)
        }

        RunLog.info(
            """
            start pid=\(ProcessInfo.processInfo.processIdentifier) \
            dryRun=\(dryRun) wpm=\(wpm) maxChars=\(maxChars) \
            profile=\(useResearch ? "research" : "practical")
            """
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespaces)
        )

        guard isAccessibilityTrusted() else {
            failAndExit(
                """
                Accessibility is not granted to humanized-type. \
                System Settings → Privacy & Security → Accessibility → enable humanized-type (and Raycast).
                """
            )
        }

        let text = readTextOrExit(
            inputFile: inputFile,
            maxChars: maxChars,
            wpm: wpm
        )
        let lineCount = text.split(whereSeparator: \.isNewline).count
        let estMin = estimateMinutes(chars: text.count, wpm: wpm)
        RunLog.info("clipboard chars=\(text.count) lines=\(lineCount) estMin=\(estMin)")

        writePidFile()
        defer { clearPidFile() }

        let config = useResearch ? ChronometryConfig.research : ChronometryConfig.practical
        var scheduler = EventScheduler(config: config, wpm: wpm)
        var rng = SystemRandomSource()
        let events = scheduler.generate(text: text, rng: &rng)
        RunLog.info("scheduled events=\(events.count)")

        if logTiming {
            writeTimingLog(scheduler.timingLog)
        }
        if dryRun {
            RunLog.info("dry-run complete; no keystrokes posted")
            exit(0)
        }

        PrecisionClock.sleep(milliseconds: 200)
        guard let target = FocusTarget.captureAfterRaycastDismisses() else {
            failAndExit(
                """
                Could not capture a text field. Focus the field, \
                then press your Raycast hotkey (✦V).
                """
            )
        }
        RunLog.info("focus lock \(target.description)")

        let posted = play(events: events, target: target)
        RunLog.info("done posted=\(posted) of \(events.count)")
        if posted == 0 {
            notify("Typed 0 keystrokes. See ~/Library/Logs/humanized-type.log")
            exit(1)
        }

        repairFieldIfNeeded(target: target, sourceText: text)
    }

    private static func failAndExit(_ message: String) -> Never {
        RunLog.fail(message)
        notify(message)
        exit(1)
    }

    private static func readTextOrExit(
        inputFile: String?,
        maxChars: Int,
        wpm: Double
    ) -> String {
        let raw: String
        if let inputFile {
            do {
                raw = try String(contentsOfFile: inputFile, encoding: .utf8)
                RunLog.info("input-file chars=\(raw.count) path=\(inputFile)")
                try? FileManager.default.removeItem(atPath: inputFile)
            } catch {
                RunLog.fail("input-file read failed: \(error)")
                raw = readPasteboardText() ?? ""
            }
        } else {
            raw = readPasteboardText() ?? ""
        }

        let trimmedCheck = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedCheck.isEmpty else {
            let types = NSPasteboard.general.types?.map(\.rawValue).joined(separator: ",") ?? "none"
            RunLog.fail("pasteboard types=\(types)")
            failAndExit(
                """
                Clipboard is empty. Copy text, focus a field, \
                then press your Raycast hotkey (✦V).
                """
            )
        }

        if maxChars > 0, raw.count > maxChars {
            let minutes = estimateMinutes(chars: raw.count, wpm: wpm)
            failAndExit(
                """
                Clipboard is \(raw.count) characters \
                (~\(minutes) min at \(Int(wpm)) WPM). \
                Refusing. Copy a shorter selection, or run with --max-chars 0.
                """
                .replacingOccurrences(of: "\n", with: " ")
            )
        }
        return raw
    }

    private static func readPasteboardText() -> String? {
        let board = NSPasteboard.general
        if let plain = board.string(forType: .string),
           !plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return plain
        }

        if let rtf = board.data(forType: .rtf),
           let attributed = NSAttributedString(
            rtf: rtf,
            documentAttributes: nil
           ) {
            let plain = attributed.string
            if !plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return plain
            }
        }

        if let html = board.data(forType: .html),
           let attributed = NSAttributedString(
            html: html,
            documentAttributes: nil
           ) {
            let plain = attributed.string
            if !plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return plain
            }
        }

        return nil
    }

    /// Returns true when this invocation only cancelled a previous typer.
    private static func handleCancelIfAlreadyRunning() -> Bool {
        let selfPid = ProcessInfo.processInfo.processIdentifier
        guard let existing = readPidFile(), existing != selfPid else {
            return false
        }
        if kill(existing, 0) == 0 {
            RunLog.info("cancel previous typer pid=\(existing)")
            kill(existing, SIGTERM)
            clearPidFile()
            notify("Humanized Type cancelled")
            return true
        }
        clearPidFile()
        return false
    }

    private static func writePidFile() {
        let pid = String(ProcessInfo.processInfo.processIdentifier)
        try? pid.write(to: pidFileURL, atomically: true, encoding: .utf8)
    }

    private static func clearPidFile() {
        try? FileManager.default.removeItem(at: pidFileURL)
    }

    private static func readPidFile() -> Int32? {
        guard let text = try? String(contentsOf: pidFileURL, encoding: .utf8) else {
            return nil
        }
        return Int32(text.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private static func isAccessibilityTrusted() -> Bool {
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let options = [promptKey: true] as CFDictionary
        let trusted = AXIsProcessTrustedWithOptions(options)
        RunLog.info("accessibility trusted=\(trusted)")
        return trusted
    }

    private static func play(
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
        let progressEvery = 25

        for (index, event) in events.enumerated() {
            let offsetMs = max(0, event.timestampMs - originMs)
            let offsetNs = UInt64(offsetMs * 1_000_000.0)
            var deadlineNs = startNs &+ offsetNs
            PrecisionClock.sleepUntil(deadlineNs: deadlineNs)

            if event.phase == .down {
                if !target.isCurrentlyFocused() {
                    if !didNotifyPause {
                        didNotifyPause = true
                        RunLog.info(
                            "paused: focus left target field \(target.description)"
                        )
                        notify(
                            """
                            Typing paused. Return to the original field to continue, \
                            or press your Raycast hotkey (✦V) to cancel.
                            """
                        )
                    }
                    while !target.isCurrentlyFocused() {
                        PrecisionClock.sleep(milliseconds: 100)
                    }
                    // Rebase clock so remaining events keep relative spacing.
                    startNs = PrecisionClock.nowNs() &- offsetNs
                    deadlineNs = startNs &+ offsetNs
                    if didNotifyPause {
                        RunLog.info("resumed: focus returned to target field")
                        didNotifyPause = false
                    }
                }
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
    private static func repairFieldIfNeeded(target: FocusTarget, sourceText: String) {
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
        RunLog.info(
            "end-repair mismatch delete=\(deleteCount) retype=\(missing.count)"
        )

        for _ in 0..<deleteCount {
            let keyDown = ScheduledKeyEvent(
                key: KeyboardTopology.backspaceToken,
                phase: .down,
                timestampMs: 0
            )
            let keyUp = ScheduledKeyEvent(
                key: KeyboardTopology.backspaceToken,
                phase: .keyUp,
                timestampMs: 0
            )
            _ = KeyEventDispatcher.post(event: keyDown)
            PrecisionClock.sleep(milliseconds: 12)
            _ = KeyEventDispatcher.post(event: keyUp)
            PrecisionClock.sleep(milliseconds: 18)
            if !target.isCurrentlyFocused() {
                RunLog.fail("end-repair aborted: focus left during backspace")
                return
            }
        }

        for character in missing {
            let key = String(character)
            let keyDown = ScheduledKeyEvent(key: key, phase: .down, timestampMs: 0)
            let keyUp = ScheduledKeyEvent(key: key, phase: .keyUp, timestampMs: 0)
            _ = KeyEventDispatcher.post(event: keyDown)
            PrecisionClock.sleep(milliseconds: 10)
            _ = KeyEventDispatcher.post(event: keyUp)
            PrecisionClock.sleep(milliseconds: 14)
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

    private static func parseWpm(from args: [String]) -> Double? {
        guard let value = parseValue(after: "--wpm", in: args),
              let wpm = Double(value),
              wpm > 0
        else {
            return nil
        }
        return wpm
    }

    private static func parseMaxChars(from args: [String]) -> Int? {
        guard let value = parseValue(after: "--max-chars", in: args),
              let maxChars = Int(value),
              maxChars >= 0
        else {
            return nil
        }
        return maxChars
    }

    private static func parseValue(after flag: String, in args: [String]) -> String? {
        guard let index = args.firstIndex(of: flag),
              args.index(after: index) < args.endIndex
        else {
            return nil
        }
        return args[args.index(after: index)]
    }

    private static func estimateMinutes(chars: Int, wpm: Double) -> Int {
        let charsPerMinute = max(wpm * 5.0, 1.0)
        return Int((Double(chars) / charsPerMinute).rounded(.up))
    }

    private static func writeTimingLog(_ samples: [TimingSample]) {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("humanized-type-timing.csv")
        var csv = "from_index,to_index,iki_ms,kind\n"
        for sample in samples {
            csv += "\(sample.fromIndex),\(sample.toIndex),\(sample.ikiMs),\(sample.kind)\n"
        }
        do {
            try csv.write(to: url, atomically: true, encoding: .utf8)
            RunLog.info("timing log \(url.path)")
        } catch {
            RunLog.fail("timing log write failed: \(error)")
        }
    }

    private static func notify(_ message: String) {
        let escaped = message
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = [
            "-e",
            "display notification \"\(escaped)\" with title \"Humanized Type\"",
        ]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            DispatchQueue.global().async {
                process.waitUntilExit()
            }
        } catch {
            RunLog.fail("notification failed: \(error)")
        }
    }
}
