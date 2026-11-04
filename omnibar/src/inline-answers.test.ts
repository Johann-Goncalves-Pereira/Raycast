import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateInlineAnswer } from "./inline-answers";

describe("evaluateInlineAnswer", () => {
  it("evaluates arithmetic expressions", () => {
    const answer = evaluateInlineAnswer("(1420 * 1.15) / 12");
    assert.ok(answer);
    assert.equal(answer?.kind, "math");
    assert.match(answer!.display, /^136\.083/);
    assert.ok(Number(answer!.copyText) > 136);
  });

  it("converts simple temperatures", () => {
    const answer = evaluateInlineAnswer("68f in c");
    assert.ok(answer);
    assert.equal(answer?.kind, "unit");
    assert.equal(answer?.copyText, "20");
  });

  it("converts currency with a fixed rate table", () => {
    const answer = evaluateInlineAnswer("100 usd to brl");
    assert.ok(answer);
    assert.equal(answer?.kind, "currency");
    assert.equal(answer?.copyText, "500");
  });

  it("returns undefined for normal search queries", () => {
    assert.equal(evaluateInlineAnswer("github pull request"), undefined);
    assert.equal(evaluateInlineAnswer(""), undefined);
  });
});
