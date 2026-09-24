import Foundation

/// Append-only run log at `~/Library/Logs/humanized-type.log`.
/// Raycast silent mode hides stderr, so failures must land on disk.
enum RunLog {
    static let fileURL: URL = {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/humanized-type.log")
    }()

    static func info(_ message: String) {
        write(level: "INFO", message: message)
    }

    static func fail(_ message: String) {
        write(level: "FAIL", message: message)
    }

    private static func write(level: String, message: String) {
        let line = "\(timestamp()) \(level) \(message)\n"
        fputs(line, stderr)
        fflush(stderr)

        let directory = fileURL.deletingLastPathComponent()
        do {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
            if !FileManager.default.fileExists(atPath: fileURL.path) {
                FileManager.default.createFile(atPath: fileURL.path, contents: nil)
            }
            let handle = try FileHandle(forWritingTo: fileURL)
            defer { try? handle.close() }
            try handle.seekToEnd()
            if let data = line.data(using: .utf8) {
                try handle.write(contentsOf: data)
            }
        } catch {
            fputs("FAIL could not write \(fileURL.path): \(error)\n", stderr)
        }
    }

    private static func timestamp() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date())
    }
}
