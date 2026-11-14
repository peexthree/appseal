import assert from "node:assert/strict";
import { test } from "node:test";
import { isSelfHost, hasPassAccess } from "../src/lib/passes.ts";

// Launch Pass gate for PDF reports and the embeddable badge: our own
// deployments are always unlocked, other hosts need a live pass in Redis
// (hasPassAccess falls back to false when Redis is absent, e.g. in tests).

test("isSelfHost unlocks our own deployments", () => {
  assert.equal(isSelfHost("appseal.online"), true);
  assert.equal(isSelfHost("www.appseal.online"), true);
  assert.equal(isSelfHost("appseal.vercel.app"), true);
  assert.equal(isSelfHost("appseal.ru"), true);
  assert.equal(isSelfHost("akulenok-tmz.ru"), true);
});

test("isSelfHost rejects foreign hosts and look-alikes", () => {
  assert.equal(isSelfHost("example.com"), false);
  assert.equal(isSelfHost("notappseal.online"), false);
  assert.equal(isSelfHost("appseal.online.evil.io"), false);
});

test("hasPassAccess without a pass is false for foreign hosts", async () => {
  assert.equal(await hasPassAccess("example.com"), false);
});

test("hasPassAccess without a pass is true for self hosts", async () => {
  assert.equal(await hasPassAccess("appseal.online"), true);
});
