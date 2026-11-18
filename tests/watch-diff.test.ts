/**
 * Watch diff helpers (src/lib/watch.ts): the fail-diff and engine-growth
 * calculators, the free-watch host-list parser shared by the bot and the
 * monitor tick, and the rich degradation alert. Pure functions - no Redis,
 * no Telegram, no scanner.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  diffFailIds,
  formatAlertRich,
  newCheckIds,
  parseWatchHosts,
  type AlertCheckResult,
  type WatchSnapshot,
} from "../src/lib/watch.ts";

const snap = (grade: string, score: number, fails: number, ids?: string[]): WatchSnapshot =>
  ids === undefined ? { grade, score, fails } : { grade, score, fails, ids };

const check = (id: string, ru?: string): AlertCheckResult => ({ id, title: ru ? { ru } : undefined });

describe("diffFailIds", () => {
  it("undefined prev ids = no baseline - no invented diff", () => {
    assert.deepEqual(diffFailIds(undefined, ["hdr", "csp"]), { newFails: [], fixed: [] });
  });

  it("empty baseline vs empty cur stays empty", () => {
    assert.deepEqual(diffFailIds([], []), { newFails: [], fixed: [] });
  });

  it("splits new failures from fixed checks", () => {
    assert.deepEqual(diffFailIds(["a", "b"], ["b", "c"]), { newFails: ["c"], fixed: ["a"] });
  });

  it("keeps duplicate ids from the current snapshot in order", () => {
    // "x" is still failing in the current scan -> not fixed, not new
    assert.deepEqual(diffFailIds(["x"], ["y", "y", "x"]), { newFails: ["y", "y"], fixed: [] });
  });

  it("duplicate ids in the baseline are harmless", () => {
    assert.deepEqual(diffFailIds(["a", "a", "b"], ["a", "b"]), { newFails: [], fixed: [] });
  });
});

describe("newCheckIds", () => {
  it("undefined prev ids = no baseline - nothing counts as new", () => {
    assert.deepEqual(newCheckIds(undefined, ["a", "b"]), []);
  });

  it("reports engine-growth ids absent from the baseline", () => {
    assert.deepEqual(newCheckIds(["a", "b"], ["b", "c", "d"]), ["c", "d"]);
  });

  it("no growth when the engine reports the same set", () => {
    assert.deepEqual(newCheckIds(["a"], ["a"]), []);
  });
});

describe("parseWatchHosts", () => {
  it("legacy bare string is a one-element list", () => {
    assert.deepEqual(parseWatchHosts("myapp.com"), ["myapp.com"]);
    assert.deepEqual(parseWatchHosts("  myapp.com  "), ["myapp.com"]);
  });

  it("new JSON object shape {\"hosts\":[...]}", () => {
    assert.deepEqual(parseWatchHosts('{"hosts":["a.com","b.com"]}'), ["a.com", "b.com"]);
  });

  it("bare JSON array also parses", () => {
    assert.deepEqual(parseWatchHosts('["a.com","b.com"]'), ["a.com", "b.com"]);
  });

  it("broken JSON is garbage - no host is guessed", () => {
    assert.deepEqual(parseWatchHosts("{broken"), []);
    assert.deepEqual(parseWatchHosts('{"hosts":["a.com"'), []);
  });

  it("a JSON object without a hosts array yields nothing", () => {
    assert.deepEqual(parseWatchHosts('{"x":1}'), []);
    assert.deepEqual(parseWatchHosts('{"hosts":"not-an-array"}'), []);
  });

  it("empty and blank values yield nothing", () => {
    assert.deepEqual(parseWatchHosts(""), []);
    assert.deepEqual(parseWatchHosts("   "), []);
  });

  it("caps the list at 3 hosts per chat", () => {
    assert.deepEqual(parseWatchHosts('{"hosts":["a.com","b.com","c.com","d.com","e.com"]}'), [
      "a.com",
      "b.com",
      "c.com",
    ]);
  });

  it("dedups, trims and drops non-string entries", () => {
    assert.deepEqual(parseWatchHosts('{"hosts":["a.com"," a.com ","b.com",42,null]}'), ["a.com", "b.com"]);
  });
});

describe("formatAlertRich", () => {
  it("without baseline ids it degrades to the plain formatAlert text", () => {
    const prev = snap("A", 90, 1);
    const cur = snap("B", 70, 3, ["hdr"]);
    const text = formatAlertRich("myapp.com", prev, cur, [check("hdr", "Заголовки")]);
    assert.match(text, /myapp\.com/);
    assert.match(text, /A → B/);
    assert.doesNotMatch(text, /Новые провалы/);
    assert.doesNotMatch(text, /Исправлено/);
  });

  it("with baseline ids it appends the concrete fail diff", () => {
    const prev = snap("A", 90, 2, ["hdr", "csp"]);
    const cur = snap("B", 70, 3, ["hdr", "cors", "dir"]);
    const results = [check("hdr", "Заголовки"), check("cors", "CORS"), check("dir", "Директории")];
    const text = formatAlertRich("myapp.com", prev, cur, results);
    assert.match(text, /A → B/);
    assert.match(text, /Новые провалы: CORS, Директории/);
    assert.match(text, /Исправлено: csp/);
  });

  it("collapses long diff lists into an and-more tail", () => {
    const prev = snap("A", 90, 1, ["old"]);
    const cur = snap("B", 70, 5, ["a", "b", "c", "d"]);
    const results = [check("a", "A"), check("b", "B"), check("c", "C"), check("d", "D")];
    const text = formatAlertRich("myapp.com", prev, cur, results);
    assert.match(text, /Новые провалы: A, B, C и ещё 1/);
  });

  it("an en-speaking chat gets the english labels", () => {
    const prev = snap("A", 90, 1, ["old"]);
    const cur = snap("B", 70, 2, ["new1"]);
    const text = formatAlertRich("myapp.com", prev, cur, [check("new1", "New one")], "en");
    assert.match(text, /New failures: New one/);
  });

  it("a fixed-only diff prints no failures line", () => {
    const prev = snap("A", 90, 2, ["a", "b"]);
    const cur = snap("A", 92, 1, ["b"]);
    const text = formatAlertRich("myapp.com", prev, cur, [check("b", "B")]);
    assert.match(text, /Исправлено: a/);
    assert.doesNotMatch(text, /Новые провалы/);
  });
});
