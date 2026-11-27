import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  isSelfHost,
  getSelfHosts,
  hasPassAccess,
  activatePass,
  extendHostPass,
  getPassRecord,
  getPassByPayment,
  hasActivePass,
  redisCommand,
} from "../src/lib/passes.ts";

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

/* ------------------------------------------------------------------ */
/* Idempotent activation (fake Upstash): payment webhooks are retried  */
/* by both providers, and both the webhook and the ?paid= return path  */
/* call activatePass. The first activation pins its record; a retry    */
/* can neither shorten a renewed pass nor resurrect an expired one.    */
/* ------------------------------------------------------------------ */

function fakeUpstash(store: Map<string, string>) {
  return async (url: unknown, init?: { body?: string }): Promise<Response> => {
    const cmd = JSON.parse(String(init?.body ?? "[]")) as string[];
    const [op, key, value, ...rest] = cmd;
    let result: string | number | null = null;
    if (op === "SET") {
      if (!rest.includes("NX") || !store.has(key)) {
        store.set(key, String(value));
        result = "OK";
      }
    } else if (op === "GET") {
      result = store.get(key) ?? null;
    } else if (op === "DEL") {
      result = store.has(key) ? 1 : 0;
      store.delete(key);
    } else if (op === "ZADD" || op === "SADD" || op === "EXPIRE" || op === "EVAL") {
      result = 1;
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
}

async function withFakeRedis(run: () => Promise<void>): Promise<void> {
  const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const prevFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://fake-cache.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  globalThis.fetch = fakeUpstash(new Map()) as typeof fetch;
  try {
    await run();
  } finally {
    if (prevUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = prevUrl;
    if (prevToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
    globalThis.fetch = prevFetch;
  }
}

test("activatePass is idempotent: a webhook retry serves the pinned record", async () => {
  await withFakeRedis(async () => {
    const first = await activatePass("yk:retry-1", "Retry.Example", 7);
    const retry = await activatePass("yk:retry-1", "retry.example", 7);
    assert.equal(retry.until, first.until); // not recomputed from now
    const stored = await getPassByPayment("yk:retry-1");
    assert.equal(stored?.until, first.until);
  });
});

test("a late webhook retry cannot clobber a renewed pass", async () => {
  await withFakeRedis(async () => {
    const first = await activatePass("yk:retry-2", "Renew.Example", 7);
    assert.equal(await extendHostPass("renew.example", 5), true);
    const renewed = await getPassRecord("renew.example");
    assert.ok(renewed && renewed.until > first.until);
    await activatePass("yk:retry-2", "renew.example", 7); // weeks-late retry
    const after = await getPassRecord("renew.example");
    assert.equal(after?.until, renewed.until); // renewed expiry survived
  });
});

test("a retry after expiry does not resurrect the pass", async () => {
  await withFakeRedis(async () => {
    const first = await activatePass("yk:retry-3", "Gone.Example", 7);
    const hostKey = `lpass:host:${createHash("sha256").update("gone.example").digest("hex")}`;
    const expired = { ...first, until: new Date(Date.now() - 1000).toISOString() };
    await redisCommand(["SET", hostKey, JSON.stringify(expired), "EX", "600"]);
    assert.equal(await hasActivePass("gone.example"), false);
    await activatePass("yk:retry-3", "gone.example", 7);
    assert.equal(await hasActivePass("gone.example"), false); // stays dead
    assert.equal((await getPassByPayment("yk:retry-3"))?.until, first.until);
  });
});
