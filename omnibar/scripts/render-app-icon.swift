import AppKit

/// Renders the dock icon for an .app into a PNG. No force unwraps.
let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  fputs("usage: render-app-icon.swift <app-path> <png-path>\n", stderr)
  exit(1)
}

let appPath = arguments[1]
let outPath = arguments[2]
let icon = NSWorkspace.shared.icon(forFile: appPath)
let target = 512
guard let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: target,
  pixelsHigh: target,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
) else {
  fputs("could not allocate icon bitmap\n", stderr)
  exit(1)
}
bitmap.size = NSSize(width: target, height: target)
guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
  fputs("could not draw icon\n", stderr)
  exit(1)
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
icon.draw(
  in: NSRect(x: 0, y: 0, width: target, height: target),
  from: .zero,
  operation: .copy,
  fraction: 1
)
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fputs("could not encode png\n", stderr)
  exit(1)
}

do {
  try png.write(to: URL(fileURLWithPath: outPath))
} catch {
  fputs("could not write png: \(error)\n", stderr)
  exit(1)
}
