import Darwin
import Foundation

/// High-precision sleep that combines coarse sleep with a short spin remainder.
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

    /// Sleep until absolute deadline in nanoseconds.
    static func sleepUntil(deadlineNs: UInt64) {
        let spinBudgetNs: UInt64 = 2_000_000

        while true {
            let now = nowNs()
            guard now < deadlineNs else { return }
            let remainingNs = deadlineNs - now

            if remainingNs > spinBudgetNs {
                let coarseNs = remainingNs - spinBudgetNs
                Thread.sleep(forTimeInterval: Double(coarseNs) / 1_000_000_000.0)
                continue
            }

            // Short spin for the last ~2 ms — no UInt subtraction after the clock
            // can pass the deadline (that overflow was trapping as SIGTRAP).
            while nowNs() < deadlineNs {
                // intentional spin
            }
            return
        }
    }

    static func sleep(milliseconds: Double) {
        guard milliseconds > 0 else { return }
        let deltaNs = UInt64(milliseconds * 1_000_000.0)
        sleepUntil(deadlineNs: nowNs() &+ deltaNs)
    }
}
