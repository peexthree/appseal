import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeScore } from "../src/lib/scanner/grade.ts";
import type { CheckResult, ScanResult } from "../src/lib/scanner/types.ts";

/**
 * Regression: every stored benchmark scan must still produce the same score
 * from the current grading logic. Any change to weights/ceilings shows up here
 * and forces an explicit decision (update the dataset or fix the code).
 */
describe("benchmark regression", () => {
  const dir = fileURLToPath(new URL("../scripts/benchmark_data/", import.meta.url));

  it("recomputed scores match stored grades/scores", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "summary.json");
    assert.ok(files.length >= 10, `expected the full panel, got ${files.length} files`);
    for (const f of files) {
      const data = JSON.parse(readFileSync(dir + f, "utf-8")) as ScanResult;
      if (data.status !== "done") continue;
      const results = (data.results ?? []) as CheckResult[];
      const { score, grade } = computeScore(results);
      assert.equal(score, data.score, `${data.host ?? f}: score drift`);
      assert.equal(grade, data.grade, `${data.host ?? f}: grade drift`);
    }
  });
});
