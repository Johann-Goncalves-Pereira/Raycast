#!/usr/bin/swift
import Cocoa
import Carbon

/// Registers Cmd+P only while a browser is frontmost, then opens Raycast Browser Spotlight.

let deeplink = "raycast://extensions/johann_goncalves_pereira/browser-spotlight/search"

let browserBundleIds: Set<String> = [
  "com.google.Chrome",
  "com.google.Chrome.canary",
  "com.google.Chrome.dev",
  "com.apple.Safari",
  "com.apple.SafariTechnologyPreview",
  "company.thebrowser.Browser",
  "company.thebrowser.dia",
  "net.imput.helium",
  "net.imput.helium.helper",
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

final class HotKeyController {
  private var hotKeyRef: EventHotKeyRef?
  private var handlerRef: EventHandlerRef?
  private let hotKeyID = EventHotKeyID(signature: OSType(0x4253_5031), id: 1)
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
    log("Browser Spotlight Cmd+P hotkey running (Carbon, browser-scoped)")
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

    let bundleId = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""
    log("Cmd+P fired; frontmost=\(bundleId)")
    openSpotlight()
    return noErr
  }

  private func sync(frontmostBundleId: String?) {
    let isBrowser = frontmostBundleId.map { browserBundleIds.contains($0) } ?? false
    if isBrowser {
      registerIfNeeded(bundleId: frontmostBundleId!)
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

func openSpotlight() {
  let task = Process()
  task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
  task.arguments = [deeplink]
  do {
    try task.run()
    log("Opened Spotlight")
  } catch {
    log("Failed to open deeplink: \(error)")
  }
}

// Ensure a single instance
let lockPath = NSHomeDirectory() + "/Library/Application Support/browser-spotlight/cmd-p.lock"
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
