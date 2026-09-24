import Darwin
import Foundation

/// High-precision sleep that combines coarse sleep with a busy-wait remainder
/// to reduce `Thread.sleep` / timer-coalescing drift on macOS.
enum PrecisionClock {
    private static let timebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    static func nowNs() -> UInt64 {
        let ticks = mach_absolute_time()
        return ticks * UInt64(timebase.numer) / UInt64(timebase.denom)
    }

    /// Sleep until absolute deadline in nanoseconds (mach absolute → ns).
    static func sleepUntil(deadlineNs: UInt64) {
        let now = nowNs()
        guard deadlineNs > now else { return }
        let remainingNs = deadlineNs - now

        // Coarse sleep for most of the wait (leave ~2 ms for spin)
        let spinBudgetNs: UInt64 = 2_000_000
        if remainingNs > spinBudgetNs {
            let coarseNs = remainingNs - spinBudgetNs
            let seconds = Double(coarseNs) / 1_000_000_000.0
            if seconds > 0 {
                Thread.sleep(forTimeInterval: seconds)
            }
        }

        while nowNs() < deadlineNs {
            // Brief yield to avoid hard spin on very long overruns
            if deadlineNs - nowNs() > 500_000 {
                Thread.sleep(forTimeInterval: 0.0001)
            }
        }
    }

    static func sleep(milliseconds: Double) {
        guard milliseconds > 0 else { return }
        let deltaNs = UInt64(milliseconds * 1_000_000.0)
        sleepUntil(deadlineNs: nowNs() + deltaNs)
    }
}
