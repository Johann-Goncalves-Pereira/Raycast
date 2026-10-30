# Open I2P Zen Profile

Raycast script command to launch or focus Zen Browser with the **I2P** profile.

## Features

- **Side-by-side Instances**: Launches Zen Browser with `--new-instance -P I2P` so it runs seamlessly alongside your default Zen profile without conflicts.
- **Smart Focus**: Automatically detects if the I2P profile is already open (via its `.parentlock` file) and activates the existing window instead of attempting a duplicate launch.
- **Dynamic Resolution**: Locates the I2P profile path via `~/Library/Application Support/zen/profiles.ini` with fallback to directory pattern matching.
- **Raycast Ready**: Includes full Raycast script metadata with `silent` HUD notifications.
- **CLI Compatible**: Can be run directly from terminal or invoked by Raycast.

## Raycast Metadata

| Property | Value |
| --- | --- |
| **Title** | Open I2P Zen Profile |
| **Mode** | `silent` |
| **Package** | Web Browsing |
| **Icon** | 🌐 |
| **Author** | Johann-Goncalves-Pereira |

## Usage

### In Raycast
1. Open Raycast Preferences -> **Extensions** -> **Script Commands**.
2. Add or reload this directory.
3. Type `Open I2P Zen Profile` in Raycast.

### From Command Line
```bash
./open-i2p-zen-profile/open-i2p-zen-profile.sh
```

You can optionally pass a URL to open on initial launch:
```bash
./open-i2p-zen-profile/open-i2p-zen-profile.sh "http://identiguy.i2p"
```

## Running Tests

```bash
./open-i2p-zen-profile/test.sh
```
