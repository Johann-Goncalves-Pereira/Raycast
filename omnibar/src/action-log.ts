import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { omnibarSupportDir } from "./last-browser";

export const ACTION_LOG_LIMIT = 1000;
const TEXT_LIMIT = 500;
const STALE_LOCK_MS = 2_000;

export type ActionField = string | number | boolean | null;

export type ActionRecord = {
  t: number;
  iso: string;
  kind: string;
} & Record<string, ActionField | undefined>;

export function actionLogPath(): string {
  return join(omnibarSupportDir(), "actions.jsonl");
}

export function actionRecord(
  fields: Record<string, ActionField | undefined>,
  now: number,
): ActionRecord {
  const kind = fields.kind;
  if (typeof kind !== "string" || kind.length === 0) {
    throw new Error("action kind is required");
  }
  const record: ActionRecord = {
    t: now,
    iso: new Date(now).toISOString(),
    kind,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "t" || key === "iso" || key === "kind" || value === undefined) {
      continue;
    }
    record[key] = typeof value === "string" ? value.slice(0, TEXT_LIMIT) : value;
  }
  return record;
}

export function trimActions(
  records: readonly ActionRecord[],
  limit = ACTION_LOG_LIMIT,
): ActionRecord[] {
  if (records.length <= limit) return [...records];
  return records.slice(records.length - limit);
}

export function parseActionLog(text: string): ActionRecord[] {
  const records: ActionRecord[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ActionRecord;
      if (typeof parsed.t === "number" && typeof parsed.kind === "string") {
        records.push(parsed);
      }
    } catch {
      // A writer can be interrupted mid-line. Keep the intact neighbors.
    }
  }
  return records;
}

export function serializeActionLog(records: readonly ActionRecord[]): string {
  if (records.length === 0) return "";
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function acquireLock(lockPath: string): boolean {
  try {
    closeSync(openSync(lockPath, "wx"));
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") return false;
    try {
      const age = Date.now() - statSync(lockPath).mtimeMs;
      if (age < STALE_LOCK_MS) return false;
      unlinkSync(lockPath);
      closeSync(openSync(lockPath, "wx"));
      return true;
    } catch {
      return false;
    }
  }
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // The next writer treats a stale lock as free after two seconds.
  }
}

/** Append one action and keep the newest `limit` lines. Safe against a crashed writer. */
export function commitActionLog(
  file: string,
  record: ActionRecord,
  limit = ACTION_LOG_LIMIT,
): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const lockPath = `${file}.lock`;
  const locked = acquireLock(lockPath);
  try {
    const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
    const next = trimActions([...parseActionLog(existing), record], limit);
    writeFileSync(file, serializeActionLog(next));
  } finally {
    if (locked) releaseLock(lockPath);
  }
}

/** Disk log for the running Omnibar. Failures stay out of the command UI. */
export function recordAction(
  fields: Record<string, ActionField | undefined>,
): void {
  try {
    commitActionLog(actionLogPath(), actionRecord(fields, Date.now()));
  } catch {
    // A full disk must not close the bar.
  }
}
