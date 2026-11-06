# Spec Catalog — Business Rules & Use Cases

Every behavioral claim in the wiki has a row here traced to automated tests.

| Kind | Meaning |
| ---- | ------- |
| `asserted-integration` | Across modules, or UI to domain |
| `asserted-unit` | One module |
| `asserted-loopback` | Live protocol on loopback |
| `fail-closed` | Deferred or refused; the test proves refusal |

## Catalog

| ID | Rule (one line) | Source | Owner | Test | Kind |
| -- | --------------- | ------ | ----- | ---- | ---- |
| `BR-QUI-01` | Qui Tauri app compiles with zero clippy warnings and formatting checks under strict profile | `qui-app/src-tauri` | Core | `cargo clippy --all-targets -- -D warnings` | `asserted-unit` |
| `BR-QUI-02` | Open Qui script detects running container, distinguishes Safari web app from Tauri wrapper, and falls back cleanly | `open-qui/open-qui.sh` | Raycast | `open-qui/test.sh` | `asserted-integration` |
| `BR-QUI-03` | Open Qui Desktop Raycast script launches Tauri bundle by bundle ID | `open-qui-desktop/open-qui-desktop.sh` | Raycast | `open-qui-desktop/test.sh` | `asserted-unit` |
| `BR-QUI-04` | Open I2P Zen profile script detects profile directory and focuses running window | `open-i2p-zen-profile/open-i2p-zen-profile.sh` | Raycast | `open-i2p-zen-profile/test.sh` | `asserted-integration` |
