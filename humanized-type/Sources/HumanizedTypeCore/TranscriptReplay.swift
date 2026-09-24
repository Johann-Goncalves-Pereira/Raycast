import Foundation

/// Folds scheduled key events into the net string a text field would contain.
public enum TranscriptReplay {
    /// Applies key-downs in timestamp order; ignores key-ups.
    /// Backspace deletes the last character; other keys append.
    public static func netText(from events: [ScheduledKeyEvent]) -> String {
        let downs = events
            .filter { $0.phase == .down }
            .sorted { lhs, rhs in
                if lhs.timestampMs != rhs.timestampMs {
                    return lhs.timestampMs < rhs.timestampMs
                }
                return lhs.key < rhs.key
            }

        var buffer = ""
        for event in downs {
            if event.key == KeyboardTopology.backspaceToken {
                if !buffer.isEmpty {
                    buffer.removeLast()
                }
            } else if !event.key.isEmpty {
                buffer.append(contentsOf: event.key)
            }
        }
        return buffer
    }
}
