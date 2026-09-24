import Foundation
import Network
import os

/// Localhost channel the Chrome extension polls for the locked tab and each character.
enum TabTypingBridge {
    static let port: UInt16 = 8765

    private struct State {
        var url = ""
        var pending: [String] = []
        var lastHello = Date.distantPast
        var active = false
    }

    private static let state = OSAllocatedUnfairLock(initialState: State())
    private static var listener: NWListener?

    static var isExtensionConnected: Bool {
        state.withLock { snapshot in
            snapshot.active && Date().timeIntervalSince(snapshot.lastHello) < 1.5
        }
    }

    static func start(url: String) {
        state.withLock { snapshot in
            snapshot.url = url
            snapshot.pending = []
            snapshot.active = true
        }
        guard listener == nil else {
            return
        }
        guard let port = NWEndpoint.Port(rawValue: port) else {
            RunLog.fail("tab bridge port is invalid")
            return
        }
        do {
            let listener = try NWListener(using: .tcp, on: port)
            listener.newConnectionHandler = { connection in
                connection.start(queue: .global(qos: .userInitiated))
                receive(connection)
            }
            listener.start(queue: .global(qos: .userInitiated))
            self.listener = listener
            RunLog.info("tab bridge listening on 127.0.0.1:\(Self.port)")
        } catch {
            RunLog.fail("tab bridge failed to listen: \(error.localizedDescription)")
        }
    }

    static func stop() {
        state.withLock { snapshot in
            snapshot.active = false
            snapshot.url = ""
            snapshot.pending = []
        }
    }

    static func enqueue(_ text: String) {
        state.withLock { $0.pending.append(text) }
    }

    private static func receive(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8_192) { data, _, _, _ in
            let request = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let response = reply(to: request)
            connection.send(
                content: Data(response.utf8),
                completion: .contentProcessed { _ in
                    connection.cancel()
                }
            )
        }
    }

    private static func reply(to request: String) -> String {
        let line = request.split(separator: "\r\n", maxSplits: 1).first ?? ""
        let parts = line.split(separator: " ")
        let method = parts.first.map(String.init) ?? ""
        let path = parts.dropFirst().first.map(String.init) ?? ""
        if method == "POST", path.hasPrefix("/hello") {
            state.withLock { $0.lastHello = Date() }
            return http(status: "204 No Content", body: "")
        }
        if method == "GET", path.hasPrefix("/session") {
            let url = state.withLock { snapshot -> String in
                snapshot.active ? snapshot.url : ""
            }
            guard !url.isEmpty else {
                return http(status: "204 No Content", body: "")
            }
            return http(status: "200 OK", body: #"{"url":"\#(json(url))"}"#)
        }
        if method == "GET", path.hasPrefix("/chars") {
            let tokens = state.withLock { snapshot -> [String] in
                let queued = snapshot.pending
                snapshot.pending = []
                return queued
            }
            let encoded = tokens.map { "\"\(json($0))\"" }.joined(separator: ",")
            return http(status: "200 OK", body: "{\"chars\":[\(encoded)]}")
        }
        return http(status: "404 Not Found", body: "")
    }

    private static func json(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\t", with: "\\t")
    }

    private static func http(status: String, body: String) -> String {
        """
        HTTP/1.1 \(status)\r
        Content-Type: application/json\r
        Content-Length: \(body.utf8.count)\r
        Connection: close\r
        Access-Control-Allow-Origin: *\r
        \r
        \(body)
        """
    }
}
