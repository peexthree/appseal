/**
 * Score simulator (the "what if I fix it" engine): re-runs the real grader on
 * a copy of the results where every fixable finding is marked as passed, so
 * the potential score/grade always come from computeScore itself - the caps
 * (critical/high ceilings) apply naturally and the numbers never promise more
 * than the grading algorithm would actually give.
 */

import type { CheckResult, Grade } from "./scanner/types.ts";
import { computeScore } from "./scanner/grade.ts";

export interface FixableItem {
  id: string;
  penalty: number;
}

export interface FixSimulation {
  /** findings a user can actually fix (fail + warn, penalty > 0), biggest first */
  items: FixableItem[];
  /** score after fixing ALL of them */
  potentialScore: number;
  potentialGrade: Grade;
  /** minimal set of fixes (in penalty order) that lifts the grade above the
   *  current one: how many items and what the grader would then give */
  stepCount: number;
  stepScore: number;
  stepGrade: Grade;
}

/** Penalty-bearing findings, sorted by the points each fix returns. */
export function fixableItems(results: CheckResult[]): FixableItem[] {
  return results
    .filter((r) => (r.status === "fail" || r.status === "warn") && r.penalty > 0)
    .sort((a, b) => b.penalty - a.penalty)
    .map((r) => ({ id: r.id, penalty: r.penalty }));
}

/** The full report: everything fixable goes green, caps recede on their own. */
export function simulateFix(results: CheckResult[]): FixSimulation {
  const items = fixableItems(results);
  const fixedAll: CheckResult[] = results.map((r) =>
    items.some((it) => it.id === r.id) ? { ...r, status: "pass" as const } : r,
  );
  const potential = computeScore(fixedAll);

  const current = computeScore(results);
  let stepCount = items.length;
  let stepScore = potential.score;
  let stepGrade = potential.grade;
  for (let take = 1; take <= items.length; take++) {
    const passIds = new Set(items.slice(0, take).map((it) => it.id));
    const partial: CheckResult[] = results.map((r) =>
      passIds.has(r.id) ? { ...r, status: "pass" as const } : r,
    );
    const sim = computeScore(partial);
    if (sim.grade !== current.grade || sim.score > current.score) {
      // the smallest penalty-ordered set that visibly moves the grade
      stepCount = take;
      stepScore = sim.score;
      stepGrade = sim.grade;
      break;
    }
  }

  return {
    items,
    potentialScore: potential.score,
    potentialGrade: potential.grade,
    stepCount,
    stepScore,
    stepGrade,
  };
}
