# Open ActivityWatch

Raycast script command to launch ActivityWatch, start the T3 Code watcher agent, and open the web dashboard.

## Features

- **App Liveness Check**: Verifies if `ActivityWatch` or `aw-qt` is running; starts the macOS app if not.
- **T3 Code Watcher Integration**: Ensures the `com.activitywatch.aw-watcher-t3` launch agent is bootstrapped, enabled, and running.
- **Server Readiness Polling**: Waits up to 15 seconds (configurable via `ACTIVITYWATCH_WAIT_SECONDS`) for the local server endpoint to respond before opening the web interface.
- **Raycast Ready**: Standard Raycast script command metadata with `silent` execution mode and bundled custom icon.
- **CLI Compatible**: Fully functional when executed directly from the terminal.

## Raycast Metadata

| Property | Value |
| --- | --- |
| **Title** | ActivityWatch |
| **Mode** | `silent` |
| **Package** | ActivityWatch |
| **Icon** | `icon.png` |
| **Author** | David |

## Usage

### In Raycast
1. Open Raycast Preferences -> **Extensions** -> **Script Commands**.
2. Add or reload this repository directory.
3. Search and run `ActivityWatch`.

### From Command Line
```bash
./open-activitywatch/open-activitywatch.sh
```

## Running Tests

```bash
./open-activitywatch/test.sh
```
