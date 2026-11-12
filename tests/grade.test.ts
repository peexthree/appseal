import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeScore, GRADE_META } from "../src/lib/scanner/grade.ts";
import type { CheckResult } from "../src/lib/scanner/types.ts";

let seq = 0;
function check(status: CheckResult["status"], severity: CheckResult["severity"], penalty: number): CheckResult {
  seq += 1;
  return {
    id: "t_" + seq,
    category: "secrets",
    status,
    severity,
    penalty,
    durationMs: 0,
    title: { ru: "t", en: "t" },
  };
}

describe("computeScore", () => {
  it("clean scan -> 100/A", () => {
    const r = computeScore([check("pass", "low", 0)]);
    assert.equal(r.score, 100);
    assert.equal(r.grade, "A");
  });

  it("critical finding caps at 44 (D)", () => {
    const r = computeScore([check("fail", "critical", 40)]);
    assert.equal(r.score, 44);
    assert.equal(r.grade, "D");
  });

  it("high finding caps at 74 (B)", () => {
    const r = computeScore([check("fail", "high", 15)]);
    assert.equal(r.score, 74);
    assert.equal(r.grade, "B");
  });

  it("penalties subtract from 100; criticals cap the grade, not the score", () => {
    const r1 = computeScore([check("warn", "medium", 8)]);
    assert.equal(r1.score, 92);
    const r2 = computeScore([check("fail", "critical", 40), check("fail", "critical", 40), check("fail", "high", 15)]);
    assert.equal(r2.score, 5);
    assert.equal(r2.grade, "D");
  });

  it("info results do not penalize", () => {
    const r = computeScore([check("info", "low", 0), check("skip", "low", 0)]);
    assert.equal(r.score, 100);
    assert.equal(r.grade, "A");
  });

  it("grade thresholds: 85+ A, 70+ B, 45+ C, else D", () => {
    for (const [score, grade] of [[100, "A"], [85, "A"], [84, "B"], [70, "B"], [69, "C"], [45, "C"], [44, "D"], [0, "D"]] as const) {
      const r = computeScore([check("pass", "low", 0), check("warn", "low", 100 - score)]);
      assert.equal(r.score, score);
      assert.equal(r.grade, grade, `score ${score} -> ${grade}`);
    }
  });

  it("grade meta colors exist", () => {
    for (const g of ["A", "B", "C", "D"]) {
      assert.ok(GRADE_META[g as "A"].color.startsWith("#"));
    }
  });
});
