#!/usr/bin/swift
import Cocoa
import Carbon
import CoreGraphics
import ApplicationServices
import Darwin

/// Registers Cmd+P only while a browser is frontmost, then opens Raycast Omnibar.

let deeplinkFallback = "raycast://extensions/johann_goncalves_pereira/omnibar/search"

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

func writeDismissStamp(action: String) {
  let recordedAt = Int(Date().timeIntervalSince1970 * 1000)
  let payload: [String: Any] = ["recordedAt": recordedAt, "action": action]
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let json = String(data: data, encoding: .utf8) else {
    log("Failed to encode dismiss stamp")
    return
  }
  do {
    try json.write(
      toFile: supportDir() + "/pending-dismiss.json",
      atomically: true,
      encoding: .utf8
    )
  } catch {
    log("Failed to write dismiss stamp: \(error)")
  }
}

struct QueryFlags {
  var empty: Bool
  var scoped: Bool
}

func readQueryFlags() -> QueryFlags {
  let path = supportDir() + "/query-state.json"
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    return QueryFlags(empty: true, scoped: false)
  }
  return QueryFlags(
    empty: (obj["empty"] as? Bool) ?? true,
    scoped: (obj["scoped"] as? Bool) ?? false
  )
}

func writeStamp(fileName: String, label: String) {
  let recordedAt = Int(Date().timeIntervalSince1970 * 1000)
  let payload: [String: Any] = ["recordedAt": recordedAt]
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let json = String(data: data, encoding: .utf8) else {
    log("Failed to encode \(label) stamp")
    return
  }
  do {
    try json.write(toFile: supportDir() + "/" + fileName, atomically: true, encoding: .utf8)
  } catch {
    log("Failed to write \(label) stamp: \(error)")
  }
}

func commandName(bundleId: String) -> String {
  let path = supportDir() + "/browser-commands.json"
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String],
        let name = obj[bundleId],
        !name.isEmpty else {
    return "search"
  }
  return name
}

func deeplinkFor(bundleId: String) -> String {
  return "raycast://extensions/johann_goncalves_pereira/omnibar/\(commandName(bundleId: bundleId))"
}

func acquireActionLock(_ lockPath: String) -> Bool {
  let created = open(lockPath, O_CREAT | O_EXCL | O_WRONLY, 0o644)
  if created >= 0 {
    close(created)
    return true
  }
  guard let attrs = try? FileManager.default.attributesOfItem(atPath: lockPath),
        let modified = attrs[.modificationDate] as? Date,
        Date().timeIntervalSince(modified) > 2 else {
    return false
  }
  try? FileManager.default.removeItem(atPath: lockPath)
  let retry = open(lockPath, O_CREAT | O_EXCL | O_WRONLY, 0o644)
  if retry >= 0 {
    close(retry)
    return true
  }
  return false
}

func appendAction(_ fields: [String: Any]) {
  var payload = fields
  payload["t"] = Int(Date().timeIntervalSince1970 * 1000)
  payload["iso"] = ISO8601DateFormatter().string(from: Date())
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let line = String(data: data, encoding: .utf8) else {
    log("Failed to encode action")
    return
  }
  let path = supportDir() + "/actions.jsonl"
  let lockPath = path + ".lock"
  let locked = acquireActionLock(lockPath)
  defer {
    if locked {
      try? FileManager.default.removeItem(atPath: lockPath)
    }
  }
  let existing = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
  var lines = existing.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
  lines.append(line)
  if lines.count > 1000 {
    lines = Array(lines.suffix(1000))
  }
  do {
    try (lines.joined(separator: "\n") + "\n").write(
      toFile: path,
      atomically: true,
      encoding: .utf8
    )
  } catch {
    log("Failed to write action log: \(error)")
  }
}

func writeSubmitStamp() {
  writeStamp(fileName: "pending-submit.json", label: "submit")
}

func writeTabStamp() {
  writeStamp(fileName: "pending-tab.json", label: "tab")
}

func writeJsonFile(path: String, payload: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let json = String(data: data, encoding: .utf8) else {
    log("Failed to encode \(path)")
    return
  }
  do {
    try json.write(toFile: path, atomically: true, encoding: .utf8)
  } catch {
    log("Failed to write \(path): \(error)")
  }
}

func lastBrowserBundleId() -> String? {
  let path = supportDir() + "/last-browser.json"
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let bundleId = obj["bundleId"] as? String,
        !bundleId.isEmpty else {
    return nil
  }
  return bundleId
}

func numberValue(_ value: Any?) -> Int? {
  if let number = value as? NSNumber {
    return number.intValue
  }
  if let number = value as? Int {
    return number
  }
  return nil
}

private let axWindowID: (@convention(c) (AXUIElement, UnsafeMutablePointer<UInt32>) -> AXError)? = {
  let path = "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
  guard let handle = dlopen(path, RTLD_LAZY) else { return nil }
  guard let symbol = dlsym(handle, "_AXUIElementGetWindow") else { return nil }
  return unsafeBitCast(
    symbol,
    to: (@convention(c) (AXUIElement, UnsafeMutablePointer<UInt32>) -> AXError).self
  )
}()

func onScreenWindowIDs(pid: pid_t) -> Set<UInt32> {
  let options = CGWindowListOption(
    rawValue: CGWindowListOption.optionOnScreenOnly.rawValue
      | CGWindowListOption.excludeDesktopElements.rawValue
  )
  guard let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    return []
  }
  var ids = Set<UInt32>()
  for window in info {
    guard let owner = numberValue(window[kCGWindowOwnerPID as String]),
          Int32(owner) == pid else {
      continue
    }
    let layer = numberValue(window[kCGWindowLayer as String]) ?? 0
    if layer != 0 { continue }
    guard let windowNumber = numberValue(window[kCGWindowNumber as String]) else { continue }
    ids.insert(UInt32(windowNumber))
  }
  return ids
}

func cgWindowNames(pid: pid_t) -> [String] {
  let options = CGWindowListOption(
    rawValue: CGWindowListOption.optionOnScreenOnly.rawValue
      | CGWindowListOption.excludeDesktopElements.rawValue
  )
  guard let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    return []
  }
  var titles: [String] = []
  for window in info {
    guard let owner = numberValue(window[kCGWindowOwnerPID as String]),
          Int32(owner) == pid else {
      continue
    }
    let layer = numberValue(window[kCGWindowLayer as String]) ?? 0
    if layer != 0 { continue }
    guard let name = window[kCGWindowName as String] as? String else { continue }
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { titles.append(trimmed) }
  }
  return titles
}

/// Titles of browser windows on the current Space. Other Spaces are off-screen.
func onScreenWindowTitles(pid: pid_t) -> [String] {
  let onScreen = onScreenWindowIDs(pid: pid)
  if onScreen.isEmpty { return [] }
  let app = AXUIElementCreateApplication(pid)
  var raw: CFTypeRef?
  let copied = AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &raw)
  guard copied == .success, let windows = raw as? [AXUIElement] else {
    return cgWindowNames(pid: pid)
  }
  var titles: [String] = []
  for window in windows {
    guard let lookup = axWindowID else { continue }
    var windowID: UInt32 = 0
    let status = lookup(window, &windowID)
    if status != .success || !onScreen.contains(windowID) { continue }
    var titleRaw: CFTypeRef?
    let titleStatus = AXUIElementCopyAttributeValue(
      window,
      kAXTitleAttribute as CFString,
      &titleRaw
    )
    guard titleStatus == .success, let title = titleRaw as? String else { continue }
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { titles.append(trimmed) }
  }
  if titles.isEmpty { return cgWindowNames(pid: pid) }
  return titles
}

func omnibarIsActive() -> Bool {
  let path = supportDir() + "/omnibar-active"
  guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
        let modified = attrs[.modificationDate] as? Date else {
    return false
  }
  return Date().timeIntervalSince(modified) < 2
}

final class HotKeyController {
  private var hotKeyRef: EventHotKeyRef?
  private var returnHotKeyRef: EventHotKeyRef?
  private var tabHotKeyRef: EventHotKeyRef?
  private var escapeHotKeyRef: EventHotKeyRef?
  private var deleteHotKeyRef: EventHotKeyRef?
  private var forwardDeleteHotKeyRef: EventHotKeyRef?
  private var handlerRef: EventHandlerRef?
  private let hotKeyID = EventHotKeyID(signature: OSType(0x4F4D_5031), id: 1) // OMP1
  private let returnHotKeyID = EventHotKeyID(signature: OSType(0x4F4D_5031), id: 2)
  private let tabHotKeyID = EventHotKeyID(signature: OSType(0x4F4D_5031), id: 3)
  private let escapeHotKeyID = EventHotKeyID(signature: OSType(0x4F4D_5031), id: 4)
  private let deleteHotKeyID = EventHotKeyID(signature: OSType(0x4F4D_5031), id: 5)
  private let forwardDeleteHotKeyID = EventHotKeyID(signature: OSType(0x4F4D_5031), id: 6)
  private var registered = false
  private var returnRegistered = false
  private var tabRegistered = false
  private var escapeRegistered = false
  private var deleteRegistered = false
  private var forwardDeleteRegistered = false
  private var lastOpenSpace: Bool?
  private var lastWindowSnapshot = ""
  private let raycastBundleId = "com.raycast.macos"

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
    Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in
      self?.syncReturnHotkey()
    }
    Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
      self?.syncDismissHotkeys()
      self?.publishOpenSpace()
    }
    Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in
      self?.publishOnScreenWindows()
    }
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
    guard err == noErr else { return noErr }
    if hk.id == 2 {
      log("Cmd+Enter swallowed for Omnibar")
      appendAction(["kind": "shortcut", "key": "cmd+return", "via": "carbon"])
      writeSubmitStamp()
      return noErr
    }
    if hk.id == 3 {
      log("Tab swallowed for Omnibar")
      appendAction(["kind": "shortcut", "key": "tab", "via": "carbon"])
      writeTabStamp()
      return noErr
    }
    if hk.id == 4 {
      log("Escape swallowed for Omnibar")
      appendAction(["kind": "shortcut", "key": "escape", "via": "carbon"])
      writeDismissStamp(action: "close")
      return noErr
    }
    if hk.id == 5 || hk.id == 6 {
      let flags = readQueryFlags()
      if !flags.empty {
        log("Delete ignored because the query is not empty")
        return noErr
      }
      let action = flags.scoped ? "exit-scope" : "close"
      let key = hk.id == 5 ? "backspace" : "forward-delete"
      log("\(key) swallowed for Omnibar (\(action))")
      appendAction(["kind": "shortcut", "key": key, "via": "carbon"])
      writeDismissStamp(action: action)
      return noErr
    }
    guard hk.id == 1 else { return noErr }

    let front = NSWorkspace.shared.frontmostApplication
    let bundleId = front?.bundleIdentifier ?? ""
    let name = front?.localizedName ?? ""
    log("Cmd+P fired; frontmost=\(bundleId)")
    if !bundleId.isEmpty {
      writeLastBrowserHint(bundleId: bundleId, name: name)
    }
    openOmnibar(bundleId: bundleId)
    return noErr
  }

  private func publishOpenSpace() {
    let flags = CGEventSource.flagsState(.combinedSessionState)
    let openSpace = flags.contains(.maskCommand) && flags.contains(.maskShift)
    if lastOpenSpace == openSpace { return }
    lastOpenSpace = openSpace
    writeJsonFile(
      path: supportDir() + "/modifier-state.json",
      payload: [
        "openSpace": openSpace,
        "recordedAt": Int(Date().timeIntervalSince1970 * 1000),
      ]
    )
  }

  private func publishOnScreenWindows() {
    guard omnibarIsActive() else { return }
    guard let bundleId = lastBrowserBundleId() else { return }
    guard let app = NSRunningApplication.runningApplications(
      withBundleIdentifier: bundleId
    ).first else {
      return
    }
    let titles = onScreenWindowTitles(pid: app.processIdentifier)
    let snapshot = titles.joined(separator: "\n")
    if snapshot == lastWindowSnapshot { return }
    lastWindowSnapshot = snapshot
    writeJsonFile(
      path: supportDir() + "/on-screen-windows.json",
      payload: [
        "titles": titles,
        "recordedAt": Int(Date().timeIntervalSince1970 * 1000),
      ]
    )
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

  private func syncReturnHotkey() {
    let front = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
    let wanted = front == raycastBundleId && omnibarIsActive()
    if wanted {
      registerReturnIfNeeded()
      registerTabIfNeeded()
    } else {
      unregisterReturnIfNeeded()
      unregisterTabIfNeeded()
    }
  }

  private func registerReturnIfNeeded() {
    guard !returnRegistered else { return }
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      UInt32(kVK_Return),
      UInt32(cmdKey),
      returnHotKeyID,
      GetEventDispatcherTarget(),
      0,
      &ref,
    )
    if status == noErr, let ref {
      returnHotKeyRef = ref
      returnRegistered = true
      log("Registered Cmd+Enter while Omnibar is open")
    } else {
      log("Register Cmd+Enter failed: \(status)")
    }
  }

  private func unregisterReturnIfNeeded() {
    guard returnRegistered, let ref = returnHotKeyRef else { return }
    UnregisterEventHotKey(ref)
    returnHotKeyRef = nil
    returnRegistered = false
  }

  private func registerTabIfNeeded() {
    guard !tabRegistered else { return }
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      UInt32(kVK_Tab),
      0,
      tabHotKeyID,
      GetEventDispatcherTarget(),
      0,
      &ref,
    )
    if status == noErr, let ref {
      tabHotKeyRef = ref
      tabRegistered = true
      log("Registered Tab while Omnibar is open")
    } else {
      log("Register Tab failed: \(status)")
    }
  }

  private func unregisterTabIfNeeded() {
    guard tabRegistered, let ref = tabHotKeyRef else { return }
    UnregisterEventHotKey(ref)
    tabHotKeyRef = nil
    tabRegistered = false
  }

  private func syncDismissHotkeys() {
    let front = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
    let wanted = front == raycastBundleId && omnibarIsActive()
    if !wanted {
      unregisterEscapeIfNeeded()
      unregisterDeleteIfNeeded()
      unregisterForwardDeleteIfNeeded()
      return
    }
    registerEscapeIfNeeded()
    if readQueryFlags().empty {
      registerDeleteIfNeeded()
      registerForwardDeleteIfNeeded()
    } else {
      unregisterDeleteIfNeeded()
      unregisterForwardDeleteIfNeeded()
    }
  }

  private func registerBareKey(
    code: Int,
    hotKeyID: EventHotKeyID,
    registered: inout Bool,
    stored: inout EventHotKeyRef?,
    label: String,
  ) {
    guard !registered else { return }
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      UInt32(code),
      0,
      hotKeyID,
      GetEventDispatcherTarget(),
      0,
      &ref,
    )
    if status == noErr, let ref {
      stored = ref
      registered = true
      log("Registered \(label) while Omnibar is open")
    } else {
      log("Register \(label) failed: \(status)")
    }
  }

  private func unregisterBareKey(
    registered: inout Bool,
    stored: inout EventHotKeyRef?,
  ) {
    guard registered, let ref = stored else { return }
    UnregisterEventHotKey(ref)
    stored = nil
    registered = false
  }

  private func registerEscapeIfNeeded() {
    registerBareKey(
      code: kVK_Escape,
      hotKeyID: escapeHotKeyID,
      registered: &escapeRegistered,
      stored: &escapeHotKeyRef,
      label: "Escape",
    )
  }

  private func unregisterEscapeIfNeeded() {
    unregisterBareKey(registered: &escapeRegistered, stored: &escapeHotKeyRef)
  }

  private func registerDeleteIfNeeded() {
    registerBareKey(
      code: kVK_Delete,
      hotKeyID: deleteHotKeyID,
      registered: &deleteRegistered,
      stored: &deleteHotKeyRef,
      label: "Backspace",
    )
  }

  private func unregisterDeleteIfNeeded() {
    unregisterBareKey(registered: &deleteRegistered, stored: &deleteHotKeyRef)
  }

  private func registerForwardDeleteIfNeeded() {
    registerBareKey(
      code: kVK_ForwardDelete,
      hotKeyID: forwardDeleteHotKeyID,
      registered: &forwardDeleteRegistered,
      stored: &forwardDeleteHotKeyRef,
      label: "Forward Delete",
    )
  }

  private func unregisterForwardDeleteIfNeeded() {
    unregisterBareKey(
      registered: &forwardDeleteRegistered,
      stored: &forwardDeleteHotKeyRef,
    )
  }
}

func openOmnibar(bundleId: String) {
  let command = commandName(bundleId: bundleId)
  let link = bundleId.isEmpty ? deeplinkFallback : deeplinkFor(bundleId: bundleId)
  appendAction([
    "kind": "shortcut",
    "key": "cmd+p",
    "via": "carbon",
    "bundleId": bundleId,
    "command": command,
  ])
  let task = Process()
  task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
  task.arguments = [link]
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
