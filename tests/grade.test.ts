import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeScore, GRADE_META, getTrophyPath } from "../src/lib/scanner/grade.ts";
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

describe("computeScore (6-tier scale A+ to E)", () => {
  it("clean scan -> 100/A+", () => {
    const r = computeScore([check("pass", "low", 0)]);
    assert.equal(r.score, 100);
    assert.equal(r.grade, "A+");
  });

  it("A+ requires absence of fails and warnings above low", () => {
    // low warning with small penalty keeps A+
    const r1 = computeScore([check("warn", "low", 2)]);
    assert.equal(r1.score, 98);
    assert.equal(r1.grade, "A+");

    // medium warning drops out of A+ into A
    const r2 = computeScore([check("warn", "medium", 2)]);
    assert.equal(r2.score, 95);
    assert.equal(r2.grade, "A");

    // any fail drops out of A+ into A
    const r3 = computeScore([check("fail", "low", 2)]);
    assert.equal(r3.score, 95);
    assert.equal(r3.grade, "A");
  });

  it("high finding caps at 84 (B)", () => {
    const r = computeScore([check("fail", "high", 5)]);
    assert.equal(r.score, 84);
    assert.equal(r.grade, "B");
  });

  it("single critical finding caps at 49 (D)", () => {
    const r = computeScore([check("fail", "critical", 10)]);
    assert.equal(r.score, 49);
    assert.equal(r.grade, "D");
  });

  it("two or more critical findings cap at 24 (E)", () => {
    const r = computeScore([check("fail", "critical", 10), check("fail", "critical", 10)]);
    assert.equal(r.score, 24);
    assert.equal(r.grade, "E");
  });

  it("penalties subtract from 100; criticals cap the grade and score", () => {
    const r1 = computeScore([check("warn", "medium", 8)]);
    assert.equal(r1.score, 92);
    assert.equal(r1.grade, "A");

    const r2 = computeScore([
      check("fail", "critical", 40),
      check("fail", "critical", 40),
      check("fail", "high", 15),
    ]);
    assert.equal(r2.score, 5);
    assert.equal(r2.grade, "E");
  });

  it("info and skip results do not penalize", () => {
    const r = computeScore([check("info", "low", 0), check("skip", "low", 0)]);
    assert.equal(r.score, 100);
    assert.equal(r.grade, "A+");
  });

  it("grade thresholds: 96+ A+, 85+ A, 70+ B, 50+ C, 25+ D, else E", () => {
    const table = [
      [100, "A+"],
      [96, "A+"],
      [95, "A"],
      [85, "A"],
      [84, "B"],
      [70, "B"],
      [69, "C"],
      [50, "C"],
      [49, "D"],
      [25, "D"],
      [24, "E"],
      [0, "E"],
    ] as const;

    for (const [targetScore, expectedGrade] of table) {
      const r = computeScore([check("pass", "low", 0), check("warn", "low", 100 - targetScore)]);
      assert.equal(r.score, targetScore);
      assert.equal(r.grade, expectedGrade, `score ${targetScore} -> ${expectedGrade}`);
    }
  });

  it("grade meta colors, secondary colors, and trophy paths exist", () => {
    const grades = ["A+", "A", "B", "C", "D", "E"] as const;
    for (const g of grades) {
      const meta = GRADE_META[g];
      assert.ok(meta.color.startsWith("#"), `${g} color`);
      assert.ok(meta.secondaryColor.startsWith("#"), `${g} secondaryColor`);
      assert.ok(meta.trophy.endsWith(".png"), `${g} trophy`);
      assert.equal(getTrophyPath(g), meta.trophy);
    }
  });
});
