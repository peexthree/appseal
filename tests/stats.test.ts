import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pairsFromFlat,
  mapFromFlat,
  avgMedianFromHistogram,
  buildTopFails,
  gradeRowsFromCounts,
  bucketHistogram,
  statsHourKeys,
  statsDayKeys,
  tldOf,
  tldRows,
  gradeDynamics,
  platformGradeCounts,
  barShare,
  formatPenaltyAvg,
} from "../src/lib/stats.ts";

describe("pairsFromFlat", () => {
  it("parses a flat ZRANGE WITHSCORES answer", () => {
    const m = pairsFromFlat(["hdr_csp", "83", "sri_missing", "0"]);
    assert.equal(m.get("hdr_csp"), 83);
    assert.equal(m.has("sri_missing"), false); // zero counts never occur in ZSETs
    assert.equal(m.size, 1);
  });
  it("survives a non-array", () => {
    assert.equal(pairsFromFlat(null).size, 0);
  });
});

describe("mapFromFlat", () => {
  it("parses a flat HGETALL answer", () => {
    const m = mapFromFlat(["A", "47", "A+", "7"]);
    assert.equal(m.get("A"), "47");
    assert.equal(m.get("A+"), "7");
  });
});

describe("avgMedianFromHistogram", () => {
  it("handles an odd total", () => {
    // scores 70x1, 80x1, 90x1 -> avg 80, median 80
    const r = avgMedianFromHistogram(["70", "1", "80", "1", "90", "1"]);
    assert.equal(r.avg, 80);
    assert.equal(r.median, 80);
  });
  it("interpolates between buckets on an even total", () => {
    // scores 70x1, 90x1 -> avg 80, median 80
    const r = avgMedianFromHistogram(["70", "1", "90", "1"]);
    assert.equal(r.avg, 80);
    assert.equal(r.median, 80);
  });
  it("picks the middle of a heavy bucket", () => {
    // scores 60x1, 80x3 -> avg 75, median 80
    const r = avgMedianFromHistogram(["60", "1", "80", "3"]);
    assert.equal(r.avg, 75);
    assert.equal(r.median, 80);
  });
  it("returns zeros on empty input", () => {
    assert.deepEqual(avgMedianFromHistogram([]), { avg: 0, median: 0 });
  });
});

describe("buildTopFails", () => {
  it("ranks by miss share and converts to percent of scans", () => {
    const fails = new Map([["csp", 50]]);
    const warns = new Map([["csp", 33], ["coop", 96]]);
    const titles = new Map([["csp", JSON.stringify({ ru: "Заголовок CSP не установлен" })]]);
    const out = buildTopFails(fails, warns, titles, 100, 10);
    assert.equal(out[0].id, "coop"); // 96 > 83
    assert.equal(out[1].id, "csp");
    assert.equal(out[1].failPct, 50);
    assert.equal(out[1].warnPct, 33);
    assert.equal(out[1].title, "Заголовок CSP не установлен");
    // no title -> id fallback
    assert.equal(out[0].title, "coop");
  });
  it("respects the limit and zero scans", () => {
    const warns = new Map([["a", 5], ["b", 3], ["c", 1]]);
    const out = buildTopFails(new Map(), warns, new Map(), 0, 2);
    assert.equal(out.length, 2);
    assert.equal(out[0].warnPct, 0);
  });
});

describe("gradeRowsFromCounts", () => {
  it("orders A+..E and drops empty grades", () => {
    const rows = gradeRowsFromCounts(new Map([["B", 3], ["A+", 1], ["E", 0], ["A", 2]]));
    assert.deepEqual(rows.map((r) => r.grade), ["A+", "A", "B"]);
  });
});

describe("bucketHistogram", () => {
  it("folds scores into decade buckets, 100 lands in the last one", () => {
    const h = bucketHistogram(["0", "2", "45", "1", "99", "3", "100", "1"]);
    assert.equal(h.length, 11);
    assert.equal(h[0].count, 2); // 0-9
    assert.equal(h[4].count, 1); // 40-49
    assert.equal(h[9].count, 3); // 90-99
    assert.equal(h[10].count, 1); // 100
    assert.equal(h[10].to, 100);
  });
  it("ignores junk scores", () => {
    const h = bucketHistogram(["250", "1", "-3", "1", "50", "2"]);
    assert.equal(h.reduce((s, b) => s + b.count, 0), 2);
    assert.equal(h[5].count, 2);
  });
});

describe("statsHourKeys", () => {
  it("builds n UTC keys oldest first", () => {
    const keys = statsHourKeys("appmot:stats:h:", new Date("2026-11-16T14:30:00Z"), 3);
    assert.deepEqual(keys, ["appmot:stats:h:2026111612", "appmot:stats:h:2026111613", "appmot:stats:h:2026111614"]);
  });
});

describe("statsDayKeys", () => {
  it("builds n UTC day keys oldest first, across month boundaries", () => {
    const keys = statsDayKeys("appmot:stats:d:", new Date("2026-11-01T09:00:00Z"), 3);
    assert.deepEqual(keys, ["appmot:stats:d:20261030", "appmot:stats:d:20261031", "appmot:stats:d:20261101"]);
  });
});

describe("tldOf / tldRows", () => {
  it("extracts the last label", () => {
    assert.equal(tldOf("app.seal.online"), "online");
    assert.equal(tldOf("plain"), "plain");
  });
  it("aggregates counts and averages", () => {
    const rows = tldRows([
      { host: "a.dev", score: 80 },
      { host: "b.dev", score: 90 },
      { host: "c.ru", score: 60 },
    ]);
    assert.deepEqual(rows[0], { tld: "dev", count: 2, avg: 85 });
    assert.deepEqual(rows[1], { tld: "ru", count: 1, avg: 60 });
  });
});

describe("gradeDynamics", () => {
  it("counts improved/dropped/stable over repeated scans (newest-first)", () => {
    const out = gradeDynamics([
      { host: "a.example", grade: "A", ts: 300 }, // newest for a: A
      { host: "b.example", grade: "C", ts: 300 }, // newest for b: C
      { host: "c.example", grade: "B", ts: 300 }, // single scan - ignored
      { host: "www.a.example", grade: "C", ts: 100 }, // oldest for a: C -> improved
      { host: "b.example", grade: "A", ts: 100 }, // oldest for b: A -> dropped
    ]);
    assert.deepEqual(out, { improved: 1, dropped: 1, stable: 0 });
  });

  it("is order-independent: oldest-first input gives the same verdict", () => {
    const out = gradeDynamics([
      { host: "a.example", grade: "C", ts: 100 }, // oldest
      { host: "a.example", grade: "A", ts: 300 }, // newest -> improved
      { host: "b.example", grade: "A", ts: 100 }, // oldest
      { host: "b.example", grade: "C", ts: 300 }, // newest -> dropped
    ]);
    assert.deepEqual(out, { improved: 1, dropped: 1, stable: 0 });
  });

  it("same grade twice holds the class, E to D counts as improved", () => {
    const out = gradeDynamics([
      { host: "stable.example", grade: "B", ts: 100 },
      { host: "stable.example", grade: "B", ts: 200 },
      { host: "rescued.example", grade: "E", ts: 100 },
      { host: "rescued.example", grade: "D", ts: 200 },
    ]);
    assert.deepEqual(out, { improved: 1, dropped: 0, stable: 1 });
  });
});

describe("platformGradeCounts", () => {
  it("buckets grades by hosting platform", () => {
    const m = platformGradeCounts([
      { host: "x.lovable.app", grade: "B" },
      { host: "x.lovable.app", grade: "A" },
      { host: "mysite.com", grade: "C" },
    ]);
    assert.equal(m.get("lovable")?.get("B"), 1);
    assert.equal(m.get("lovable")?.get("A"), 1);
    assert.equal(m.get("custom")?.get("C"), 1);
  });

  it("uses the engine-detected platform before the host suffix", () => {
    const m = platformGradeCounts([
      { host: "lovablebuild.com", grade: "A", platform: "Lovable" },
      { host: "v0build.dev", grade: "B", platform: "v0/Vercel" },
    ]);
    assert.equal(m.get("lovable")?.get("A"), 1);
    assert.equal(m.get("vercel")?.get("B"), 1);
    assert.equal(m.has("custom"), false);
  });
});

describe("barShare", () => {
  it("scales a row to the widest row so a 3% share stays readable", () => {
    assert.equal(barShare(3, 10), 30);
    assert.equal(barShare(10, 10), 100);
  });
  it("keeps a visible sliver for non-zero rows and nothing for zeros", () => {
    assert.equal(barShare(1, 1000), 2); // 0.1% -> 2% sliver
    assert.equal(barShare(0, 10), 0);
    assert.equal(barShare(5, 0), 0); // no rows at all
  });
});

describe("formatPenaltyAvg", () => {
  it("keeps one decimal, so nothing collapses into -0 б.", () => {
    assert.equal(formatPenaltyAvg(0.4, "ru"), "-0,4");
    assert.equal(formatPenaltyAvg(1.6, "ru"), "-1,6");
    assert.equal(formatPenaltyAvg(0.4, "en"), "-0.4");
    assert.equal(formatPenaltyAvg(0, "en"), "-0.0");
  });
});
