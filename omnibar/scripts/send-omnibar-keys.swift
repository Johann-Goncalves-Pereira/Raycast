#!/usr/bin/swift
import AppKit
import CoreGraphics
import Foundation

func postKey(_ code: CGKeyCode, flags: CGEventFlags = []) {
  guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
        let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) else {
    return
  }
  down.flags = flags
  up.flags = flags
  down.post(tap: .cghidEventTap)
  up.post(tap: .cghidEventTap)
}

func raycastOnScreen() -> Bool {
  let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
  return info.contains { window in
    (window["kCGWindowOwnerName"] as? String) == "Raycast"
      && (window["kCGWindowName"] as? String) == "Main Window"
  }
}

let keyCode: [Character: CGKeyCode] = [
  "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
  "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
  "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40,
  "n": 45, "m": 46, ".": 47,
]

let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--wait" {
  let deadline = Date().addingTimeInterval(3)
  while Date() < deadline {
    if raycastOnScreen() {
      fputs("open\n", stdout)
      exit(0)
    }
    Thread.sleep(forTimeInterval: 0.05)
  }
  fputs("closed\n", stdout)
  exit(1)
}

if args.first == "--visible" {
  fputs(raycastOnScreen() ? "open\n" : "closed\n", stdout)
  exit(raycastOnScreen() ? 0 : 1)
}

let text = args.first ?? ""
let chord = args.count > 1 ? args[1] : ""
if let raycast = NSRunningApplication.runningApplications(withBundleIdentifier: "com.raycast.macos").first {
  raycast.activate()
  Thread.sleep(forTimeInterval: 0.25)
}
for character in text.lowercased() {
  guard let code = keyCode[character] else {
    fputs("unsupported character \(character)\n", stderr)
    exit(2)
  }
  postKey(code)
  usleep(35_000)
}
if chord == "cmd-return" {
  usleep(350_000)
  postKey(36, flags: .maskCommand)
} else if chord == "return" {
  usleep(1_200_000)
  postKey(36)
} else if chord == "tab" {
  usleep(200_000)
  postKey(48)
} else if chord == "clear-cmd-return" {
  postKey(0, flags: .maskCommand)
  usleep(80_000)
  postKey(51)
  usleep(80_000)
  postKey(36, flags: .maskCommand)
} else if chord == "escape" {
  postKey(53)
}
