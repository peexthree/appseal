import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeRegistry, isDofollow, type RegistryEntry } from "../src/lib/registry.ts";

describe("dedupeRegistry", () => {
  it("keeps the newest scan per host, newest first", () => {
    const entries: RegistryEntry[] = [
      { host: "a.example", grade: "C", score: 55, ts: 100, id: "old-a" },
      { host: "b.example", grade: "A", score: 95, ts: 200, id: "b" },
      { host: "a.example", grade: "A", score: 97, ts: 300, id: "new-a" },
    ];
    const out = dedupeRegistry(entries);
    assert.equal(out.length, 2);
    assert.equal(out[0].host, "a.example");
    assert.equal(out[0].id, "new-a");
    assert.equal(out[1].host, "b.example");
  });
  it("survives an empty list", () => {
    assert.deepEqual(dedupeRegistry([]), []);
  });
});

describe("isDofollow", () => {
  it("grade A earns dofollow", () => {
    assert.equal(isDofollow({ host: "x", grade: "A", score: 92, ts: 1, id: "i" }), true);
  });
  it("lower grades stay nofollow", () => {
    for (const g of ["B", "C", "D", "F"]) {
      assert.equal(isDofollow({ host: "x", grade: g, score: 10, ts: 1, id: "i" }), false);
    }
  });
});
