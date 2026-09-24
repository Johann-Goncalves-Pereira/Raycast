import AppKit
import ApplicationServices
import Foundation
import HumanizedTypeCore

@main
enum HumanizedTypeMain {
    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        let logTiming = args.contains("--log-timing")
        let dryRun = args.contains("--dry-run")
        let wpm = parseWpm(from: args) ?? 65.0

        RunLog.info(
            "start pid=\(ProcessInfo.processInfo.processIdentifier) dryRun=\(dryRun) wpm=\(wpm)"
        )

        guard isAccessibilityTrusted() else {
            let message = """
            Accessibility is not granted to humanized-type. \
            System Settings → Privacy & Security → Accessibility → enable humanized-type (and Raycast).
            """
            RunLog.fail(message)
            notify(message)
            exit(1)
        }

        guard let text = NSPasteboard.general.string(forType: .string),
              !text.isEmpty
        else {
            let message = "Clipboard is empty. Copy text, focus a field, then press ⌥V."
            RunLog.fail(message)
            notify(message)
            exit(1)
        }

        RunLog.info("clipboard chars=\(text.count) lines=\(text.split(separator: "\n").count)")

        // Let Raycast dismiss before keystrokes land in the previous app.
        if !dryRun {
            PrecisionClock.sleep(milliseconds: 250)
        }

        var scheduler = EventScheduler(config: .default, wpm: wpm)
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

        let posted = play(events: events)
        RunLog.info("done posted=\(posted) of \(events.count)")
    }

    private static func isAccessibilityTrusted() -> Bool {
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let options = [promptKey: true] as CFDictionary
        let trusted = AXIsProcessTrustedWithOptions(options)
        RunLog.info("accessibility trusted=\(trusted)")
        return trusted
    }

    private static func play(events: [ScheduledKeyEvent]) -> Int {
        guard let first = events.first else {
            RunLog.fail("scheduler produced zero events")
            return 0
        }
        let originMs = first.timestampMs
        let startNs = PrecisionClock.nowNs()
        var posted = 0
        var failures = 0

        for event in events {
            let offsetMs = event.timestampMs - originMs
            let deadlineNs = startNs + UInt64(max(0, offsetMs) * 1_000_000.0)
            PrecisionClock.sleepUntil(deadlineNs: deadlineNs)
            if KeyEventDispatcher.post(event: event) {
                posted += 1
            } else {
                failures += 1
                if failures == 1 {
                    RunLog.fail(
                        "CGEvent post failed for key=\(event.key) phase=\(event.phase.rawValue)"
                    )
                }
            }
        }

        if failures > 0 {
            RunLog.fail("CGEvent failures=\(failures) posted=\(posted)")
        }
        return posted
    }

    private static func parseWpm(from args: [String]) -> Double? {
        guard let index = args.firstIndex(of: "--wpm"),
              args.index(after: index) < args.endIndex,
              let value = Double(args[args.index(after: index)]),
              value > 0
        else {
            return nil
        }
        return value
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
        let escaped = message.replacingOccurrences(of: "\"", with: "'")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = [
            "-e",
            "display notification \"\(escaped)\" with title \"Humanized Type\"",
        ]
        do {
            try process.run()
        } catch {
            RunLog.fail("notification failed: \(error)")
        }
    }
}
