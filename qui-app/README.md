# Qui Desktop App

A frameless macOS desktop wrapper for [qui](https://getqui.com) built with Tauri v2 and Rust.

## Features

- **Frameless Window**: Custom macOS window with transparent backdrop, rounded corners, draggable titlebar (`data-tauri-drag-region`), and native window controls.
- **Docker Auto-Management**:
  - Automatically verifies Colima and Docker daemon on launch.
  - Pulls the latest image updates from `ghcr.io/autobrr/qui:latest` on launch.
  - Starts or recreates the container and polls `http://localhost:7476/` until ready.
  - **Clean Shutdown**: Automatically stops the Qui container when the app window is closed or the app quits.
- **Zen Browser (Annonimo Container) Bridge**: On startup, opens Qui in Zen using the `Annonimo` container; titlebar button focuses it again.
- **Status & Controls**: Real-time connection badge, reload button, minimize, maximize, and close controls.

## Building

One-shot install to `~/Applications/Qui.app`:

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

## Raycast

Use **Open Qui Desktop** to launch this wrapper, or run:

```bash
open ~/Applications/Qui.app
```
