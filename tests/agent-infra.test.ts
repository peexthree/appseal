import test from "node:test";
import assert from "node:assert/strict";
import { getConnIp, tickSecretOk } from "../src/lib/sec.ts";
import { buildHealthPayload, HEALTH_PING_KEY } from "../src/app/api/healthz/payload.ts";
import { bumpDailyQuota } from "../src/lib/passes.ts";

/**
 * Infra-hardening suite: tick-secret gate, connection-IP helper, healthz
 * payload contract and the atomic quota bump pattern (SET NX + INCR). The
 * Redis-dependent test intercepts global fetch with a tiny Upstash REST
 * emulator (same response shape: {"result": ...}) and restores everything
 * afterwards - no real network is touched.
 */

/* ----------------------------- getConnIp ----------------------------- */

test("getConnIp prefers x-real-ip over x-forwarded-for", () => {
  const h = new Headers({
    "x-real-ip": "1.2.3.4",
    "x-forwarded-for": "5.6.7.8, 9.10.11.12",
  });
  assert.equal(getConnIp(h), "1.2.3.4");
});

test("getConnIp takes the LAST x-forwarded-for entry when it is well-formed", () => {
  assert.equal(getConnIp(new Headers({ "x-forwarded-for": "5.6.7.8, 9.10.11.12" })), "9.10.11.12");
  assert.equal(getConnIp(new Headers({ "x-forwarded-for": "5.6.7.8" })), "5.6.7.8");
});

test("getConnIp falls back to the first well-formed entry when the last is garbage", () => {
  assert.equal(getConnIp(new Headers({ "x-forwarded-for": "9.10.11.12, not-an-ip" })), "9.10.11.12");
  assert.equal(getConnIp(new Headers({ "x-forwarded-for": "not-an-ip" })), "unknown");
  assert.equal(getConnIp(new Headers()), "unknown");
});

/* ---------------------------- tickSecretOk ---------------------------- */

test("tickSecretOk is open when no secret is configured", () => {
  assert.equal(tickSecretOk(new Headers(), "https://x/api/tick", undefined), true);
  assert.equal(tickSecretOk(new Headers(), "https://x/api/tick", null), true);
  assert.equal(tickSecretOk(new Headers(), "https://x/api/tick", ""), true);
  assert.equal(tickSecretOk(new Headers(), "https://x/api/tick", "   "), true);
});

test("tickSecretOk requires the secret via header or query when configured", () => {
  const url = "https://x/api/monitor-tick";
  assert.equal(tickSecretOk(new Headers(), url, "s3cret"), false);
  assert.equal(tickSecretOk(new Headers({ "x-tick-secret": "s3cret" }), url, "s3cret"), true);
  assert.equal(tickSecretOk(new Headers(), "https://x/api/monitor-tick?secret=s3cret", "s3cret"), true);
  assert.equal(tickSecretOk(new Headers(), "https://x/api/monitor-tick?secret=wrong", "s3cret"), false);
  assert.equal(
    tickSecretOk(new Headers({ "x-tick-secret": "wrong" }), "https://x/api/monitor-tick?secret=also-wrong", "s3cret"),
    false,
  );
});

/* --------------------------- healthz payload --------------------------- */

test("healthz payload carries no secrets and only the agreed fields", () => {
  const p = buildHealthPayload("up");
  assert.deepEqual(Object.keys(p).sort(), ["ok", "redis", "ts", "uptime"]);
  assert.equal(p.ok, true);
  assert.equal(p.redis, "up");
  assert.equal(Number.isFinite(p.uptime) && p.uptime >= 0, true);
  assert.ok(!Number.isNaN(Date.parse(p.ts)));
});

test("healthz payload accepts every redis state word verbatim", () => {
  for (const state of ["up", "down", "skipped"] as const) {
    const p = buildHealthPayload(state);
    assert.equal(p.redis, state);
    assert.equal(p.ok, true);
  }
  // the ping key never carries secrets or user data: plain appmot namespace
  assert.match(HEALTH_PING_KEY, /^appmot:[a-z:]+$/);
});

/* -------------------- bumpDailyQuota (SET NX + INCR) -------------------- */

/** Minimal Upstash REST emulator over a Map with per-key TTL bookkeeping. */
function makeFakeUpstash() {
  const store = new Map<string, { value: string; exp: number | null }>();
  const calls: string[][] = [];
  const fakeFetch = async (url: string | URL, init?: { body?: string }) => {
    const cmd = JSON.parse(init?.body ?? "[]") as string[];
    calls.push(cmd);
    const op = String(cmd[0]).toUpperCase();
    const key = String(cmd[1]);
    let result: unknown = null;
    if (op === "SET") {
      const value = String(cmd[2]);
      const nx = cmd.includes("NX");
      const exIdx = cmd.findIndex((f) => String(f).toUpperCase() === "EX");
      const ttl = exIdx >= 0 ? Number(cmd[exIdx + 1]) : null;
      if (!nx || !store.has(key)) {
        store.set(key, { value, exp: ttl && ttl > 0 ? Date.now() + ttl * 1000 : null });
        result = "OK";
      }
    } else if (op === "INCR") {
      const cur = Number(store.get(key)?.value ?? "0") || 0;
      const next = cur + 1;
      store.set(key, { value: String(next), exp: store.get(key)?.exp ?? null });
      result = next;
    } else if (op === "GET") {
      const rec = store.get(key);
      result = rec ? rec.value : null;
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return { store, calls, fakeFetch };
}

test("bumpDailyQuota pins the TTL atomically and counts INCRs (mocked Upstash)", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://test-db.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const { store, calls, fakeFetch } = makeFakeUpstash();
  const realFetch = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = fakeFetch;
  try {
    const a = await bumpDailyQuota("abc123test", 3);
    assert.deepEqual(a, { used: 1, allowed: true });

    // the SET NX must have run first and carried EX - the key already has a
    // TTL after the very first bump (an expire can no longer be lost)
    const quotaKeys = [...store.keys()].filter((k) => k.startsWith("quota:abc123test:"));
    assert.equal(quotaKeys.length, 1);
    const key = quotaKeys[0];
    const exp1 = store.get(key)?.exp ?? 0;
    assert.ok(exp1 > Date.now(), "TTL must be set by SET NX before the first INCR");

    const b = await bumpDailyQuota("abc123test", 3);
    assert.deepEqual(b, { used: 2, allowed: true });
    // a second bump must not reset the TTL (the NX branch lost the race)
    assert.equal(store.get(key)?.exp, exp1);

    const c = await bumpDailyQuota("abc123test", 3);
    assert.deepEqual(c, { used: 3, allowed: true });
    const d = await bumpDailyQuota("abc123test", 3);
    assert.deepEqual(d, { used: 4, allowed: false });
    assert.equal(store.get(key)?.value, "4");

    // command order per bump: SET NX first, INCR second
    const setIdx = calls.findIndex((cmd) => cmd[0] === "SET" && cmd[1] === key);
    const incrIdx = calls.findIndex((cmd) => cmd[0] === "INCR" && cmd[1] === key);
    assert.ok(setIdx >= 0 && incrIdx > setIdx, "SET NX must precede INCR");
  } finally {
    (globalThis as { fetch: unknown }).fetch = realFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
});

test("bumpDailyQuota without Redis fails open with used=1", async () => {
  // no UPSTASH_* env in tests: redisCommand short-circuits to null
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const a = await bumpDailyQuota("no-redis-hash", 1);
  assert.deepEqual(a, { used: 1, allowed: true });
  const b = await bumpDailyQuota("no-redis-hash", 0);
  assert.deepEqual(b, { used: 1, allowed: false });
});
