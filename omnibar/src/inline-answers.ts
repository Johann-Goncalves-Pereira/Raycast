export type InlineAnswer = {
  id: string;
  kind: "math" | "unit" | "currency";
  title: string;
  subtitle: string;
  display: string;
  copyText: string;
};

const FX: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  brl: 0.2,
  jpy: 0.0067,
  cad: 0.74,
};

const MATH_RE = /^[\d\s.+\-*/()%]+$/;
const TEMP_RE =
  /^(-?\d+(?:\.\d+)?)\s*(°?\s*)(f|c|fahrenheit|celsius)\s*(?:to|in|→|->)?\s*(°?\s*)(f|c|fahrenheit|celsius)?$/i;
const CURRENCY_RE =
  /^(\d+(?:\.\d+)?)\s*([a-z]{3})\s*(?:to|in|→|->)\s*([a-z]{3})$/i;

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(rounded);
}

function safeEvalMath(expression: string): number | undefined {
  const cleaned = expression.replace(/\s+/g, "");
  if (!cleaned || !MATH_RE.test(cleaned) || /[a-zA-Z_]/.test(cleaned)) {
    return undefined;
  }
  // Reject empty / operator-only input
  if (!/\d/.test(cleaned)) return undefined;
  try {
    // eslint-disable-next-line no-new-func -- deterministic local math only; input is digit/operator-gated
    const result = Function(`"use strict"; return (${cleaned});`)() as unknown;
    return typeof result === "number" && Number.isFinite(result)
      ? result
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTempUnit(raw: string | undefined): "f" | "c" | undefined {
  if (!raw) return undefined;
  const u = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (u === "f" || u === "fahrenheit") return "f";
  if (u === "c" || u === "celsius") return "c";
  return undefined;
}

function convertTemp(value: number, from: "f" | "c", to: "f" | "c"): number {
  if (from === to) return value;
  if (from === "f" && to === "c") return ((value - 32) * 5) / 9;
  return (value * 9) / 5 + 32;
}

/**
 * Deterministic inline answers (Arc Max zero-click utilities).
 * Enter should copy `copyText` and dismiss — never navigate.
 */
export function evaluateInlineAnswer(query: string): InlineAnswer | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;

  const temp = TEMP_RE.exec(trimmed);
  if (temp) {
    const value = Number(temp[1]);
    const from = normalizeTempUnit(temp[3]);
    const to = normalizeTempUnit(temp[5]) ?? (from === "f" ? "c" : "f");
    if (from && to && Number.isFinite(value)) {
      const result = convertTemp(value, from, to);
      const display = formatNumber(result);
      return {
        id: "inline-temp",
        kind: "unit",
        title: display,
        subtitle: `${value}${from.toUpperCase()} → ${to.toUpperCase()}`,
        display,
        copyText: display,
      };
    }
  }

  const currency = CURRENCY_RE.exec(trimmed);
  if (currency) {
    const amount = Number(currency[1]);
    const from = currency[2].toLowerCase();
    const to = currency[3].toLowerCase();
    const fromRate = FX[from];
    const toRate = FX[to];
    if (fromRate && toRate && Number.isFinite(amount)) {
      const usd = amount * fromRate;
      const result = usd / toRate;
      const display = formatNumber(Math.round(result * 100) / 100);
      return {
        id: "inline-fx",
        kind: "currency",
        title: `${display} ${to.toUpperCase()}`,
        subtitle: `${amount} ${from.toUpperCase()} → ${to.toUpperCase()} (approx)`,
        display,
        copyText: display,
      };
    }
  }

  if (MATH_RE.test(trimmed) && /[+\-*/()]/.test(trimmed)) {
    const result = safeEvalMath(trimmed);
    if (result !== undefined) {
      const display = formatNumber(result);
      return {
        id: "inline-math",
        kind: "math",
        title: display,
        subtitle: trimmed,
        display,
        copyText: display,
      };
    }
  }

  return undefined;
}
