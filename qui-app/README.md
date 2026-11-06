# Qui Desktop App

A frameless, squircle macOS desktop wrapper for [qui](https://getqui.com) built on Apple WebKit (`WKWebView`), Tauri v2, and Rust.

## Features

- **No Top Bar (Zero Chrome)**: Clean frameless design with zero titlebar or header chrome taking up vertical space. The WebKit viewport fills 100% of the squircle window.
- **Squircle Rounded Borders**: Continuous macOS squircle corner curvature (`22px` radius) with anti-aliased subpixel clipping and subtle glass edge lighting.
- **Translucent Background with Backdrop Blur**:
  - Native macOS acrylic vibrancy via AppKit `NSVisualEffectView` (`FullScreenUI`).
  - CSS glassmorphism layer with `-webkit-backdrop-filter: blur(40px) saturate(180%)`.
- **WebKit Engine Performance**:
  - Runs natively on Apple WebKit (`WKWebView`) without Electron or Chromium overhead.
  - Hardware accelerated graphics and minimal RAM footprint.
- **Invisible Drag Region**:
  - Top 26px drag strip (`-webkit-app-region: drag`) enables effortless window movement without any visible bar.
  - Discreet, floating traffic lights softly fade in on hover in the top-left corner.
  - Keyboard shortcuts: `Cmd+W` / `Cmd+Q` (clean quit), `Cmd+R` (reload), `Cmd+O` / `Cmd+Shift+Z` (open in Zen Annonimo).
- **Docker Auto-Management**:
  - Verifies Colima and Docker daemon on launch.
  - Automatically pulls the latest image updates from `ghcr.io/autobrr/qui:latest` on launch.
  - Starts or recreates the container and polls `http://localhost:7476/` until ready.
  - **Clean Shutdown**: Automatically stops the Qui container when the app window is closed or the app quits.
- **Zen Browser (Annonimo Container) Bridge**: Automatically opens the running Qui instance in Zen Browser under the `Annonimo` Multi-Account Container once ready.

## Building & Installing

One-shot build and install to `~/Applications/Qui.app`:

```bash
./qui-app/scripts/build-and-install-macos.sh
```

Manual steps:

```bash
# Verify formatting and linting
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# Build release macOS application bundle
npm install
npm run build
```

Built application bundle is generated at:
`src-tauri/target/release/bundle/macos/Qui.app`
and installed to:
`~/Applications/Qui.app`

## Related Docs
- [`../docs/README.md`](../docs/README.md)
- [`../open-qui-desktop/README.md`](../open-qui-desktop/README.md)

## Launching

Use **Open Qui Desktop** in Raycast, or run:

```bash
open ~/Applications/Qui.app
```
