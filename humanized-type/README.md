# Humanized Type

Raycast Script Command that types the macOS clipboard with research-derived
biomechanical timing (hold / flight distributions, digraph modifiers, linguistic
pauses, and optional error-correction loops).

**Source package:** SwiftPM under this folder  
**Raycast entry:** [`humanized-type.sh`](humanized-type.sh)

---

## Overview

| Property | Value |
|----------|--------|
| Raycast title | Humanized Type |
| Mode | `silent` |
| Runtime | CoreGraphics HID + Accessibility focus lock |
| Default speed | ~190 WPM (practical) |
| Error rate | ~2% alphanumeric substitutions |
| Thinking pauses | 5–15 s every ~400–900 chars (pastes ≥ 200 chars) |

---

## Build & standalone test

```bash
cd humanized-type
chmod +x humanized-type.sh scripts/validate
swift build -c release
```

CLI (focus a text field first; Accessibility must be granted to Terminal):

```bash
# Copy text, then:
pbcopy <<< 'Hello, world. This is a timing check.'
./.build/release/humanized-type
```

Optional flags:

```bash
./.build/release/humanized-type --wpm 120
./.build/release/humanized-type --research          # slow research-accurate timing + errors
./.build/release/humanized-type --max-chars 5000    # default cap is 5000; 0 = unlimited
./.build/release/humanized-type --log-timing
./.build/release/humanized-type --dry-run
```

Default Raycast profile is **practical** (~190 WPM, linguistic pauses, ~2% typos, 5–15s thinking pauses on long pastes). Press ⌥V again while typing to **cancel**.

### Focus lock

After Raycast dismisses, the script captures the focused AX text field and **re-focuses it before every key-down**. You can switch apps or click elsewhere; typing continues in the original field when the AX node remains valid.

Caveat: Google Docs / some canvas editors expose a weak Accessibility tree. If the lock cannot be restored five times in a row, typing stops and a notification is shown (see `~/Library/Logs/humanized-type.log`).

Validate (SwiftLint strict + tests + release build):

```bash
# from repo root:
./scripts/validate
# or:
./humanized-type/scripts/validate
```

---

## Raycast deployment

1. Build once: `swift build -c release --package-path humanized-type`
2. In Raycast → **Extensions** → **Script Commands** → add this folder as a Script Directory (or link `humanized-type.sh`).
3. Bind a hotkey (e.g. `⌘⇧V`).
4. Grant **Accessibility** to **Raycast** (System Settings → Privacy & Security → Accessibility).
5. Copy text → focus the target field → run **Humanized Type**.

The shell wrapper rebuilds the release binary if it is missing, then **detaches** the typer and exits immediately. Raycast cancels script commands after about 30 seconds; a real clipboard takes longer than that, which is why ⌥V used to fail mid-type.

Failure log (also written when Accessibility is missing or the clipboard is empty):

```bash
tail -f ~/Library/Logs/humanized-type.log
```

---

## Architecture

```text
IDLE → DISPATCH_KEY_DOWN → DWELL_SLEEP → DISPATCH_KEY_UP
    → FLIGHT_SLEEP → CHUNK_EVALUATION → (ERROR_PIPELINE | next)

ERROR_PIPELINE:
  INJECT_ADJACENT_TYPO → MOTOR_INERTIA_OVERRUN → COGNITIVE_FREEZE
  → BURST_BACKSPACE → RESUMPTION_PAUSE
```

| Module | Role |
|--------|------|
| `HumanizedTypeCore` | QWERTY matrix, Box-Muller / Pareto samplers, digraph engine, scheduler |
| `HumanizedType` | Pasteboard, Accessibility check, precision sleep, `CGEvent` dispatch |

Empirical constants live in `ChronometryConfig` (Module 1–4 midpoints / Module 6 defaults).

---

## Timing QA (productivity check)

With `--log-timing`, inspect the CSV of down-to-down intervals (`iki_ms`, `kind`):

```bash
./.build/release/humanized-type --log-timing
# stderr prints the CSV path, then:
python3 - <<'PY'
import csv, statistics, collections
path = "/var/folders/.../humanized-type-timing.csv"  # use printed path
rows = list(csv.DictReader(open(path)))
by = collections.defaultdict(list)
for r in rows:
    by[r["kind"]].append(float(r["iki_ms"]))
for kind, xs in sorted(by.items()):
    if len(xs) < 2: continue
    print(kind, "n=", len(xs), "median=", round(statistics.median(xs),1),
          "mean=", round(statistics.mean(xs),1),
          "skewish mean/median=", round(statistics.mean(xs)/statistics.median(xs),2))
PY
```

Expect:

- `intra_word` / `word` medians in the ~100–300 ms band at default WPM
- `sentence` pauses ≫ `word` / `intra_word` (Pareto \(t_{min}=1100\) ms)
- Positive skew (`mean/median` > 1) on motor + cognitive mixes

This is a sanity check for the synthesizer, not a detector-evasion test.

---

## Accessibility

Without Accessibility trust, the tool exits with a clear message and code `1`.
Empty clipboard exits `0` silently (Raycast-friendly).
