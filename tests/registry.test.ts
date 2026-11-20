import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeRegistry,
  filterRegistryEntries,
  isDofollow,
  isRegistryChipKey,
  platformBucketOf,
  platformOf,
  REGISTRY_MAX,
  type RegistryEntry,
} from "../src/lib/registry.ts";

describe("dedupeRegistry", () => {
  it("keeps the newest scan per host, newest first", () => {
    const entries: RegistryEntry[] = [
      { host: "a.example", grade: "C", score: 55, ts: 100, id: "old-a" },
      { host: "b.example", grade: "A", score: 95, ts: 200, id: "b" },
      { host: "a.example", grade: "A+", score: 98, ts: 300, id: "new-a" },
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
  it("grades A+ and A earn dofollow", () => {
    assert.equal(isDofollow({ host: "x", grade: "A+", score: 99, ts: 1, id: "i" }), true);
    assert.equal(isDofollow({ host: "x", grade: "A", score: 92, ts: 1, id: "i" }), true);
  });
  it("lower grades stay nofollow", () => {
    for (const g of ["B", "C", "D", "E"]) {
      assert.equal(isDofollow({ host: "x", grade: g, score: 10, ts: 1, id: "i" }), false);
    }
  });
});

describe("REGISTRY_MAX", () => {
  it("fits the mass runs - the 16k+-host catalog is not trimmed to 1000", () => {
    assert.equal(REGISTRY_MAX, 30000);
  });
});

describe("platformOf", () => {
  it("maps the hosting-platform suffixes", () => {
    assert.equal(platformOf("x.lovable.app"), "lovable");
    assert.equal(platformOf("y.vercel.app"), "vercel");
    assert.equal(platformOf("z.github.io"), "github");
    for (const h of ["a.web.app", "a.firebaseapp.com", "a.gitlab.io", "a.deno.dev", "a.glitch.me", "a.amplifyapp.com", "a.azurestaticapps.net"]) {
      assert.equal(platformOf(h), "other", h);
    }
    assert.equal(platformOf("mysite.com"), "custom");
  });
});

describe("platformBucketOf", () => {
  it("engine-detected platform wins over the host suffix", () => {
    assert.equal(platformBucketOf({ host: "lovablebuild.com", platform: "Lovable" }), "lovable");
    assert.equal(platformBucketOf({ host: "v0build.dev", platform: "v0/Vercel" }), "vercel");
    assert.equal(platformBucketOf({ host: "replitbuild.com", platform: "Replit" }), "other");
  });
  it("falls back to the host suffix without the field", () => {
    assert.equal(platformBucketOf({ host: "x.lovable.app" }), "lovable");
    assert.equal(platformBucketOf({ host: "mysite.com" }), "custom");
  });
});

describe("isRegistryChipKey", () => {
  it("accepts the chip keys and rejects junk", () => {
    for (const k of ["all", "top", "custom", "lovable", "github", "vercel", "other"]) {
      assert.equal(isRegistryChipKey(k), true, k);
    }
    assert.equal(isRegistryChipKey("drop table"), false);
    assert.equal(isRegistryChipKey(undefined), false);
  });
});

describe("filterRegistryEntries", () => {
  const entries: RegistryEntry[] = [
    { host: "alpha.com", grade: "A+", score: 99, ts: 300, id: "a", desc: "Family aquarium center" },
    { host: "beta.lovable.app", grade: "B", score: 60, ts: 200, id: "b" },
    { host: "www.gamma.com", grade: "A", score: 92, ts: 150, id: "g" },
  ];
  it("chip top keeps only A/A+", () => {
    const out = filterRegistryEntries(entries, { chip: "top" });
    assert.deepEqual(out.map((e) => e.id), ["a", "g"]);
  });
  it("platform chip matches the engine bucket", () => {
    const withPlatform = [...entries, { host: "custom-build.com", grade: "C", score: 40, ts: 100, id: "c", platform: "Lovable" }];
    const out = filterRegistryEntries(withPlatform, { chip: "lovable" });
    assert.deepEqual(out.map((e) => e.id), ["b", "c"]);
  });
  it("query matches host ignoring www and description text", () => {
    assert.deepEqual(filterRegistryEntries(entries, { q: "www.gamma" }).map((e) => e.id), ["g"]);
    assert.deepEqual(filterRegistryEntries(entries, { q: "aquarium" }).map((e) => e.id), ["a"]);
  });
});
