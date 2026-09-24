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
| Runtime | CoreGraphics HID events (no third-party deps) |
| Default speed | 65 WPM |
| Error rate | 2.5% alphanumeric substitutions |

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
./.build/release/humanized-type --wpm 55
./.build/release/humanized-type --log-timing   # writes /tmp…/humanized-type-timing.csv
```

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

The shell wrapper rebuilds the release binary automatically if it is missing.

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
