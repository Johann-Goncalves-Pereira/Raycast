# Open Qui Desktop

Raycast script that launches the **frameless Tauri wrapper** at `~/Applications/Qui.app`.

That app (see [`../qui-app/`](../qui-app/)) manages Docker while it is open: pulls the latest Qui image, runs the container on port **7476**, opens **Zen Browser** in the **Annonimo** container, embeds the Qui UI, and **stops the container** when you close or quit.

This is separate from [`../open-qui/`](../open-qui/), which targets your **Safari “Add to Dock”** web app.

## Build & install

```bash
./qui-app/scripts/build-and-install-macos.sh
```

## Raycast

Reload script commands and run **Open Qui Desktop**.

## Environment

- `QUI_DESKTOP_APP_PATH`: Override path to the Tauri `.app` bundle.
- `QUI_TAURI_BUNDLE_ID`: Bundle ID to match (default `com.ukvdavi.qui`).

## Tests

```bash
./open-qui-desktop/test.sh
```
