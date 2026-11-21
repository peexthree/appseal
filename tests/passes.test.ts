import assert from "node:assert/strict";
import { test } from "node:test";
import { isSelfHost, getSelfHosts, hasPassAccess } from "../src/lib/passes.ts";

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

// SELF_HOSTS env extension: the hardcoded base plus a per-deployment comma
// list; the parse is cached in the module and re-runs only when the env value
// actually changes (in production that is once per process).

test("getSelfHosts extends the hardcoded base from the SELF_HOSTS env", () => {
  process.env.SELF_HOSTS = " Partner.Example , OWN-SITE.Ru ,,  ";
  const hosts = getSelfHosts();
  assert.equal(hosts.has("partner.example"), true);
  assert.equal(hosts.has("own-site.ru"), true);
  assert.equal(hosts.has("appseal.online"), true); // base stays intact
  assert.equal(isSelfHost("www.partner.example"), true);
});

test("getSelfHosts re-parses on env change and drops blanks", () => {
  process.env.SELF_HOSTS = "extra.example";
  const hosts = getSelfHosts();
  assert.equal(hosts.has("extra.example"), true);
  assert.equal(hosts.has("partner.example"), false); // previous env is gone
  delete process.env.SELF_HOSTS;
  const reset = getSelfHosts();
  assert.equal(reset.has("extra.example"), false);
  assert.equal(reset.has("appseal.vercel.app"), true); // hardcoded base remains
});
