import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildHistGroups,
  pickHistGroups,
  scansLabel,
  histRangeLabel,
  histDateLabel,
  type HistEntry,
} from "../src/app/verified/[host]/history-groups.ts";

/**
 * The public /verified/[host] profile is the agent-facing trust surface: its
 * scan history must read as stable dynamics, not a bouncing feed of 32
 * look-alike rows. The grouping logic is a dependency-free pure module
 * (src/app/verified/[host]/history-groups.ts) imported here directly.
 */

const e = (id: string, ts: number, grade: string, score: number): HistEntry => ({ id, ts, grade, score });

describe("agent-trust: verified profile history grouping", () => {
  it("collapses consecutive scans with the same grade+score into one dated group", () => {
    // appseal.online-like feed: 30 identical scans, one dip, one return
    const history = [
      ...Array.from({ length: 30 }, (_, i) => e(`a${i}`, i, "A+", 97)),
      e("dip", 30, "A", 88),
      e("back", 31, "A+", 97),
    ];
    const groups = buildHistGroups(history);
    assert.deepEqual(
      groups.map((g) => [g.grade, g.score, g.count, g.from, g.to, g.firstId, g.lastId]),
      [
        ["A+", 97, 30, 0, 29, "a0", "a29"],
        ["A", 88, 1, 30, 30, "dip", "dip"],
        ["A+", 97, 1, 31, 31, "back", "back"],
      ],
    );
  });

  it("breaks groups on grade and on score changes, keeps group ids", () => {
    const groups = buildHistGroups([
      e("a1", 1, "A+", 97),
      e("a2", 2, "A+", 97),
      e("a3", 3, "A+", 98),
      e("a4", 4, "A", 88),
      e("a5", 5, "A", 88),
      e("a6", 6, "A+", 97),
    ]);
    assert.equal(groups.length, 4);
    assert.deepEqual(groups.map((g) => g.score), [97, 98, 88, 97]);
    assert.deepEqual(groups.map((g) => g.count), [2, 1, 2, 1]);
    assert.deepEqual(groups.map((g) => g.firstId), ["a1", "a3", "a4", "a6"]);
    assert.deepEqual(groups.map((g) => g.lastId), ["a2", "a3", "a5", "a6"]);
  });

  it("caps the list at 15 groups keeping origin, current state and grade swings", () => {
    // 40 groups alternating A+/A: every boundary is a grade change
    const groups = buildHistGroups(
      Array.from({ length: 40 }, (_, i) => e(`x${i}`, i, i % 2 === 0 ? "A+" : "A", i % 2 === 0 ? 97 : 88)),
    );
    const shown = pickHistGroups(groups, 15);
    assert.ok(shown.length <= 15, "cap 15 respected");
    assert.equal(shown[0], groups[0], "origin kept");
    assert.equal(shown[shown.length - 1], groups[groups.length - 1], "current state kept");
    // shown is an ascending subsequence of the full group list
    for (let i = 1; i < shown.length; i++) {
      assert.ok(groups.indexOf(shown[i]) > groups.indexOf(shown[i - 1]), "order preserved");
    }
    // recent grade swings stay visible: at least 6 groups of each grade
    assert.ok(shown.filter((g) => g.grade === "A").length >= 6, "A swings visible");
    assert.ok(shown.filter((g) => g.grade === "A+").length >= 6, "A+ swings visible");
  });

  it("returns short inputs as-is", () => {
    const groups = buildHistGroups([e("a1", 1, "B", 75), e("a2", 2, "A", 90)]);
    assert.equal(pickHistGroups(groups, 15), groups);
    assert.equal(pickHistGroups([], 15).length, 0);
  });

  it("pluralizes the run size (ru forms and en scans)", () => {
    assert.equal(scansLabel(1, "ru"), "1 проверка");
    assert.equal(scansLabel(2, "ru"), "2 проверки");
    assert.equal(scansLabel(4, "ru"), "4 проверки");
    assert.equal(scansLabel(5, "ru"), "5 проверок");
    assert.equal(scansLabel(11, "ru"), "11 проверок");
    assert.equal(scansLabel(14, "ru"), "14 проверок");
    assert.equal(scansLabel(21, "ru"), "21 проверка");
    assert.equal(scansLabel(32, "ru"), "32 проверки");
    assert.equal(scansLabel(1, "en"), "1 scan");
    assert.equal(scansLabel(3, "en"), "3 scans");
  });

  it("formats UTC run date ranges per locale", () => {
    const run = { from: Date.UTC(2026, 10, 13), to: Date.UTC(2026, 10, 14), count: 5 };
    assert.equal(histRangeLabel(run, "ru", false), "13-14 нояб.");
    assert.equal(histRangeLabel(run, "en", false), "Nov 13-14");
    assert.equal(histRangeLabel(run, "ru", true), "13-14 нояб. 2026");
    assert.equal(histRangeLabel(run, "en", true), "Nov 13-14, 2026");

    const sameDay = { from: Date.UTC(2026, 10, 13, 6), to: Date.UTC(2026, 10, 13, 18), count: 3 };
    assert.equal(histRangeLabel(sameDay, "ru", false), "13 нояб.");
    assert.equal(histRangeLabel(sameDay, "en", false), "Nov 13");

    const crossMonth = { from: Date.UTC(2026, 10, 30), to: Date.UTC(2026, 11, 2), count: 4 };
    assert.equal(histRangeLabel(crossMonth, "ru", false), "30 нояб. - 2 дек.");
    assert.equal(histRangeLabel(crossMonth, "en", false), "Nov 30 - Dec 2");

    const crossYear = { from: Date.UTC(2025, 11, 28), to: Date.UTC(2026, 0, 3), count: 4 };
    assert.equal(histRangeLabel(crossYear, "ru", false), "28 дек. 2025 - 3 янв. 2026");
    assert.equal(histRangeLabel(crossYear, "en", false), "Dec 28, 2025 - Jan 3, 2026");
  });

  it("single scans keep the full date, collapsed runs add the count", () => {
    const single = { from: Date.UTC(2026, 10, 13), to: Date.UTC(2026, 10, 13), count: 1 };
    assert.equal(histDateLabel({ ...single, grade: "A", score: 90, firstId: "s", lastId: "s" }, "ru", true), "13 ноября 2026 г.");
    assert.match(
      histDateLabel({ ...single, grade: "A", score: 90, firstId: "s", lastId: "s" }, "en", true),
      /November 13, 2026/,
    );

    const run = { from: Date.UTC(2026, 10, 13), to: Date.UTC(2026, 10, 14), count: 5 };
    assert.equal(histDateLabel({ ...run, grade: "A", score: 90, firstId: "s", lastId: "s" }, "ru", false), "13-14 нояб., 5 проверок");
    assert.equal(histDateLabel({ ...run, grade: "A", score: 90, firstId: "s", lastId: "s" }, "en", false), "Nov 13-14 · 5 scans");
  });
});
