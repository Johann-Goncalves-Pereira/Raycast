# Open Qui

Raycast script command that verifies if the [qui](https://getqui.com) Docker container is running (starting it automatically if it isn't) and opens or focuses its Safari Web App.

## Features

- **Automatic Health & Daemon Check**: Detects if `qui` is running. If Docker or Colima is idle or stopped, it starts the daemon and brings up the container automatically.
- **Port & API Polling**: Waits until Qui's HTTP server is fully responsive before attempting to open the interface.
- **Safari Web App First**: Discovers standalone Safari web apps (`com.apple.Safari.WebApp.*`, etc.) and **ignores** the optional Tauri `Qui.app` (`com.ukvdavi.qui`) so Raycast opens the Dock web app you create in Safari.
- **Graceful Fallback**: If the standalone Safari Web App has not been created yet, it opens `http://localhost:7476` directly in Safari and displays a helpful HUD tip.
- **Raycast Ready**: Built with standard Raycast script command metadata and `silent` mode HUD feedback.

## Raycast Metadata

| Property | Value |
| --- | --- |
| **Title** | Open Qui |
| **Mode** | `silent` |
| **Package** | Applications |
| **Icon** | 🌐 |
| **Author** | Johann-Goncalves-Pereira |

## Turning Qui into a Safari Web App

1. Ensure Qui is running (run `./open-qui/open-qui.sh` or visit `http://localhost:7476` in Safari).
2. In Safari's menu bar, click **File** -> **Add to Dock...** (or **Add to Desktop...** depending on your macOS settings).
3. Keep the suggested name **qui** (or **Qui**) and click **Add**.
4. macOS creates a standalone Safari Web App inside `~/Applications/qui.app`.
5. From then on, running `Open Qui` from Raycast will immediately launch and focus the standalone Qui desktop window.

## Usage

### In Raycast
1. Open Raycast Preferences -> **Extensions** -> **Script Commands**.
2. Add this repository folder (or reload script directories).
3. Search and run `Open Qui`.

### From Command Line
```bash
./open-qui/open-qui.sh
```

### Environment Overrides (Optional)
- `QUI_APP_PATH`: Specify a custom path to your Safari Web App bundle (e.g. `export QUI_APP_PATH="/Applications/Qui.app"`).
- `QUI_CONFIG_DIR`: Specify a custom config directory for Qui (defaults to `~/Developer/programs/qui/config`).
- `QUI_TAURI_BUNDLE_ID`: Bundle ID of the native Tauri wrapper to exclude from Safari web app detection (defaults to `com.ukvdavi.qui`).

## Running Tests

```bash
./open-qui/test.sh
```
