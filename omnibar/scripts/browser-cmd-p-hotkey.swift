#!/usr/bin/swift
import Cocoa
import Carbon

/// Registers Cmd+P only while a browser is frontmost, then opens Raycast Omnibar.

let deeplink = "raycast://extensions/johann_goncalves_pereira/omnibar/search"

let browserBundleIds: Set<String> = [
  "com.google.Chrome",
  "com.google.Chrome.canary",
  "com.google.Chrome.dev",
  "com.apple.Safari",
  "com.apple.SafariTechnologyPreview",
  "company.thebrowser.dia",
  "net.imput.helium",
  "net.imput.helium.helper",
  "app.zen-browser.zen",
  "com.brave.Browser",
  "com.microsoft.edgemac",
  "com.vivaldi.Vivaldi",
  "com.operasoftware.Opera",
  "com.kagi.kagimacOS",
  "org.chromium.Chromium",
]

func log(_ message: String) {
  fputs(message + "\n", stderr)
  fflush(stderr)
}

func supportDir() -> String {
  NSHomeDirectory() + "/Library/Application Support/omnibar"
}

func writeLastBrowserHint(bundleId: String, name: String) {
  let dir = supportDir()
  do {
    try FileManager.default.createDirectory(
      atPath: dir,
      withIntermediateDirectories: true,
      attributes: nil
    )
  } catch {
    log("Failed to create support dir: \(error)")
  }

  let recordedAt = Int(Date().timeIntervalSince1970 * 1000)
  let payload: [String: Any] = [
    "bundleId": bundleId,
    "name": name,
    "recordedAt": recordedAt,
  ]
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let json = String(data: data, encoding: .utf8) else {
    log("Failed to encode last-browser hint")
    return
  }
  let path = dir + "/last-browser.json"
  do {
    try json.write(toFile: path, atomically: true, encoding: .utf8)
  } catch {
    log("Failed to write last-browser hint: \(error)")
  }
}

final class HotKeyController {
  private var hotKeyRef: EventHotKeyRef?
  private var handlerRef: EventHandlerRef?
  private let hotKeyID = EventHotKeyID(signature: OSType(0x4F4D_5031), id: 1) // OMP1
  private var registered = false

  func start() {
    var eventType = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: UInt32(kEventHotKeyPressed),
    )

    let status = InstallEventHandler(
      GetEventDispatcherTarget(),
      { _, event, userData -> OSStatus in
        guard let userData else { return noErr }
        let controller = Unmanaged<HotKeyController>.fromOpaque(userData).takeUnretainedValue()
        return controller.handle(event)
      },
      1,
      &eventType,
      UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()),
      &handlerRef,
    )

    guard status == noErr else {
      log("InstallEventHandler failed: \(status)")
      exit(1)
    }

    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification,
      object: nil,
      queue: .main,
    ) { [weak self] note in
      let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
      self?.sync(frontmostBundleId: app?.bundleIdentifier)
    }

    sync(frontmostBundleId: NSWorkspace.shared.frontmostApplication?.bundleIdentifier)
    log("Omnibar Cmd+P hotkey running (Carbon, browser-scoped)")
  }

  private func handle(_ event: EventRef?) -> OSStatus {
    var hk = EventHotKeyID()
    let err = GetEventParameter(
      event,
      EventParamName(kEventParamDirectObject),
      EventParamType(typeEventHotKeyID),
      nil,
      MemoryLayout<EventHotKeyID>.size,
      nil,
      &hk,
    )
    guard err == noErr, hk.id == 1 else { return noErr }

    let front = NSWorkspace.shared.frontmostApplication
    let bundleId = front?.bundleIdentifier ?? ""
    let name = front?.localizedName ?? ""
    log("Cmd+P fired; frontmost=\(bundleId)")
    if !bundleId.isEmpty {
      writeLastBrowserHint(bundleId: bundleId, name: name)
    }
    openOmnibar()
    return noErr
  }

  private func sync(frontmostBundleId: String?) {
    let isBrowser = frontmostBundleId.map { browserBundleIds.contains($0) } ?? false
    if isBrowser {
      if let bundleId = frontmostBundleId {
        registerIfNeeded(bundleId: bundleId)
      }
    } else {
      unregisterIfNeeded()
    }
  }

  private func registerIfNeeded(bundleId: String) {
    guard !registered else { return }
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      UInt32(kVK_ANSI_P),
      UInt32(cmdKey),
      hotKeyID,
      GetEventDispatcherTarget(),
      0,
      &ref,
    )
    if status == noErr, let ref {
      hotKeyRef = ref
      registered = true
      log("Registered Cmd+P for browser \(bundleId)")
    } else {
      log("RegisterEventHotKey failed: \(status)")
    }
  }

  private func unregisterIfNeeded() {
    guard registered, let ref = hotKeyRef else { return }
    UnregisterEventHotKey(ref)
    hotKeyRef = nil
    registered = false
    log("Unregistered Cmd+P (left browser)")
  }
}

func openOmnibar() {
  let task = Process()
  task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
  task.arguments = [deeplink]
  do {
    try task.run()
    log("Opened Omnibar")
  } catch {
    log("Failed to open deeplink: \(error)")
  }
}

// Ensure a single instance
let lockDir = supportDir()
try? FileManager.default.createDirectory(
  atPath: lockDir,
  withIntermediateDirectories: true,
  attributes: nil
)
let lockPath = lockDir + "/cmd-p.lock"
let lockFd = open(lockPath, O_CREAT | O_RDWR, 0o644)
if lockFd >= 0 {
  if flock(lockFd, LOCK_EX | LOCK_NB) != 0 {
    log("Another instance is already running — exiting")
    exit(0)
  }
}

let controller = HotKeyController()
controller.start()
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
