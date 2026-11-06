import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ACTION_LOG_LIMIT,
  actionRecord,
  commitActionLog,
  parseActionLog,
  trimActions,
} from "./action-log";

describe("trimActions", () => {
  it("keeps the latest 1000 actions", () => {
    const records = Array.from({ length: 1005 }, (_, index) =>
      actionRecord({ kind: "type", q: String(index) }, index),
    );
    const trimmed = trimActions(records);
    assert.equal(trimmed.length, ACTION_LOG_LIMIT);
    assert.equal(trimmed[0]?.q, "5");
    assert.equal(trimmed[trimmed.length - 1]?.q, "1004");
  });
});

describe("actionRecord", () => {
  it("stores the time and clips long text", () => {
    const record = actionRecord(
      { kind: "type", q: "y".repeat(800), empty: undefined },
      1_700_000_000_000,
    );
    assert.equal(record.t, 1_700_000_000_000);
    assert.equal(record.iso, "2023-11-14T22:13:20.000Z");
    assert.equal(record.q?.toString().length, 500);
    assert.equal("empty" in record, false);
  });
});

describe("parseActionLog", () => {
  it("skips a torn line and keeps the valid ones", () => {
    const parsed = parseActionLog(
      '{"t":1,"kind":"open"}\n{torn\n{"t":2,"kind":"type","q":"you"}\n',
    );
    assert.deepEqual(
      parsed.map((record) => record.kind),
      ["open", "type"],
    );
  });
});

describe("commitActionLog", () => {
  it("appends and caps the file at the latest 1000", () => {
    const dir = mkdtempSync(join(tmpdir(), "omnibar-log-"));
    const file = join(dir, "actions.jsonl");
    for (let index = 0; index < ACTION_LOG_LIMIT + 3; index += 1) {
      commitActionLog(
        file,
        actionRecord({ kind: "type", q: String(index) }, index + 1),
      );
    }
    const stored = parseActionLog(readFileSync(file, "utf8"));
    assert.equal(stored.length, ACTION_LOG_LIMIT);
    assert.equal(stored[0]?.q, "3");
    assert.equal(stored[stored.length - 1]?.q, String(ACTION_LOG_LIMIT + 2));
  });

  it("replaces a stale lock so a crash cannot freeze the log", () => {
    const dir = mkdtempSync(join(tmpdir(), "omnibar-lock-"));
    const file = join(dir, "actions.jsonl");
    const lock = `${file}.lock`;
    writeFileSync(lock, "");
    const old = new Date(Date.now() - 10_000);
    utimesSync(lock, old, old);
    commitActionLog(file, actionRecord({ kind: "shortcut", key: "tab" }, 50));
    assert.equal(statSync(file).isFile(), true);
    const stored = parseActionLog(readFileSync(file, "utf8"));
    assert.equal(stored[0]?.key, "tab");
  });
});
