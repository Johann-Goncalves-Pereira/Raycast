import AppKit
import ApplicationServices
import Foundation
import HumanizedTypeCore

@main
enum HumanizedTypeMain {
    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        let logTiming = args.contains("--log-timing")
        let wpm = parseWpm(from: args) ?? 65.0

        guard AXIsProcessTrusted() else {
            fputs(
                """
                Accessibility permission required.
                System Settings → Privacy & Security → Accessibility → enable Terminal / Raycast.
                """,
                stderr
            )
            exit(1)
        }

        guard let text = NSPasteboard.general.string(forType: .string),
              !text.isEmpty
        else {
            // Empty clipboard: silent no-op for Raycast
            exit(0)
        }

        // Allow Raycast UI to dismiss before keystrokes hit the frontmost app
        PrecisionClock.sleep(milliseconds: 250)

        var scheduler = EventScheduler(config: .default, wpm: wpm)
        var rng = SystemRandomSource()
        let events = scheduler.generate(text: text, rng: &rng)

        if logTiming {
            writeTimingLog(scheduler.timingLog)
        }

        play(events: events)
    }

    private static func play(events: [ScheduledKeyEvent]) {
        guard let first = events.first else { return }
        let originMs = first.timestampMs
        let startNs = PrecisionClock.nowNs()

        for event in events {
            let offsetMs = event.timestampMs - originMs
            let deadlineNs = startNs + UInt64(max(0, offsetMs) * 1_000_000.0)
            PrecisionClock.sleepUntil(deadlineNs: deadlineNs)
            KeyEventDispatcher.post(event: event)
        }
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
            fputs("Timing log written to \(url.path)\n", stderr)
        } catch {
            fputs("Failed to write timing log: \(error)\n", stderr)
        }
    }
}
