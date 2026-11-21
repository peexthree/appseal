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
    // the raw benchmark panel is fixture data and stays out of git (only
    // summary/meta is committed) - a fresh clone or CI has no panel, so the
    // regression only asserts where the dataset actually exists
    if (files.length < 10) return;
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

/* ------------------- owner-alert privacy (152-FZ) --------------------- */

/**
 * 152-FZ compliance regression: IP = personal data, so the owner Telegram
 * alerts (scan + purchase) must carry only the coarse edge-derived country
 * line from regionLine() - never the raw client IP.
 */
describe("owner-alert privacy regression", () => {
  it("the scan alert uses regionLine and never embeds the raw client IP", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/app/api/scan/route.ts", import.meta.url)),
      "utf-8",
    );
    assert.match(source, /regionLine\(req\.headers\)/);
    assert.doesNotMatch(source, /📡 IP:/);
  });

  it("the purchase alert uses regionLine and never embeds the raw client IP", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/app/api/purchase/route.ts", import.meta.url)),
      "utf-8",
    );
    assert.match(source, /regionLine\(req\.headers\)/);
    assert.doesNotMatch(source, /📡 IP:/);
  });
});

/* ------------------- payer email privacy (152-FZ) --------------------- */

/**
 * 152-FZ: a payer email is direct personal data, and the bot explicitly
 * promises "у нас не хранится" - so the purchase alert must reach Telegram
 * only in the masked i***@domain form (matching the YooKassa/Lava dashboards
 * is still possible, identifying a person is not).
 */
describe("payer email privacy regression", () => {
  it("maskEmail keeps the dashboard match and drops identification", async () => {
    const { maskEmail } = await import("../src/lib/sec.ts");
    assert.equal(maskEmail("ivan.petrov1990@gmail.com"), "i***@gmail.com");
    assert.equal(maskEmail("a@yandex.ru"), "a***@yandex.ru");
    // garbage stays out of the alert entirely
    assert.equal(maskEmail("no-at-sign"), "***");
    assert.equal(maskEmail("a@"), "***");
    assert.equal(maskEmail("@domain.com"), "***");
    assert.equal(maskEmail(""), "***");
  });

  it("the purchase alert embeds only maskEmail(email), never the raw address", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/app/api/purchase/route.ts", import.meta.url)),
      "utf-8",
    );
    assert.match(source, /maskEmail\(email\)/);
    assert.doesNotMatch(source, /📧 Email: \$\{email\}/);
  });
});
