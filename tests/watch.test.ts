import assert from "node:assert/strict";
import { test } from "node:test";
import {
  gradeIndex,
  detectDegradation,
  formatAlert,
  type WatchSnapshot,
} from "../src/lib/watch.ts";

const snap = (grade: string, score: number, fails = 0): WatchSnapshot => ({ grade, score, fails });

test("gradeIndex orders the six-tier scale (higher = worse)", () => {
  assert.ok(gradeIndex("A+") < gradeIndex("A"));
  assert.ok(gradeIndex("A") < gradeIndex("B"));
  assert.ok(gradeIndex("B") < gradeIndex("C"));
  assert.ok(gradeIndex("C") < gradeIndex("D"));
  assert.ok(gradeIndex("D") < gradeIndex("E"));
  assert.equal(gradeIndex("garbage"), 5);
});

test("first scan is a baseline - no degradation reported", () => {
  assert.equal(detectDegradation(null, snap("B", 70)), null);
});

test("grade drop is detected", () => {
  assert.equal(detectDegradation(snap("A+", 100), snap("B", 80)), "grade-drop");
});

test("score drop of 10+ points is detected within the same grade", () => {
  assert.equal(detectDegradation(snap("A", 90, 1), snap("A", 79, 1)), "score-drop");
});

test("small score jitter is not a drop", () => {
  assert.equal(detectDegradation(snap("A", 90), snap("A", 85)), null);
});

test("fail count spike of 3+ is detected", () => {
  assert.equal(detectDegradation(snap("A", 90, 1), snap("A", 88, 5)), "fails-spike");
});

test("improvement is not a drop", () => {
  assert.equal(detectDegradation(snap("B", 70), snap("A+", 95)), null);
});

test("formatAlert names the host and the concrete changes", () => {
  const text = formatAlert("example.com", snap("A+", 100), snap("B", 74, 6));
  assert.match(text, /example\.com/);
  assert.match(text, /A\+ → B/);
});
