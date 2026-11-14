/**
 * Launch Pass store: one paid pass = one domain, unlimited scans for 7 days.
 *
 * Redis-only (Upstash REST, same env vars as the scan store): passes are
 * payment-backed data, they must survive restarts and never fall back to a
 * writable local file. If Redis is absent the feature degrades to "no
 * passes" instead of failing the scan flow.
 */

import { createHash } from "node:crypto";
import { WATCH_KEY } from "./watch.ts";

const PASS_TTL_SECONDS = 8 * 24 * 3600; // 7-day pass + 1 day of grace

// 152-FZ data localization (part 5, art. 18): storing payer emails here would
// require an RF-hosted database. The email goes to YooKassa for the receipt
// and is NEVER written to our store - only non-personal references (payment
// id, domain, expiry) stay.
export interface PassRecord {
  paymentId: string;
  host: string;
  until: string; // ISO timestamp
}

interface RedisCfg {
  url: string;
  token: string;
}

function redisConfig(): RedisCfg | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** Outbound Redis calls are pinned to https + a *.upstash.io host (SSRF allowlist). */
function upstashHostOk(raw: string): boolean {
  const host = raw.split("/")[2] ?? "";
  return raw.startsWith("https://") && (host === "upstash.io" || host.endsWith(".upstash.io"));
}

async function redisCommand<T>(command: string[]): Promise<T | null> {
  const cfg = redisConfig();
  if (!cfg || !upstashHostOk(cfg.url)) return null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { result?: T | null; error?: string };
    if (!res.ok || data.error) return null;
    return data.result ?? null;
  } catch {
    return null;
  }
}

/** Passes are looked up by exact normalized hostname (lowercase, no www). */
function passHostKey(host: string): string {
  const clean = host.replace(/^www\./i, "").toLowerCase();
  return `lpass:host:${createHash("sha256").update(clean).digest("hex")}`;
}

export async function activatePass(paymentId: string, host: string): Promise<PassRecord> {
  const record: PassRecord = {
    paymentId,
    host: host.replace(/^www\./i, "").toLowerCase(),
    until: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  };
  await redisCommand(["SET", `lpass:pay:${paymentId}`, JSON.stringify(record), "EX", String(PASS_TTL_SECONDS)]);
  await redisCommand(["SET", passHostKey(record.host), JSON.stringify(record), "EX", String(PASS_TTL_SECONDS)]);
  // paid hosts join the background watchlist; score 0 = rescan ASAP
  await redisCommand(["ZADD", WATCH_KEY, "0", record.host]);
  return record;
}

export async function getPassByPayment(paymentId: string): Promise<PassRecord | null> {
  const raw = await redisCommand<string>(["GET", `lpass:pay:${paymentId}`]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PassRecord;
  } catch {
    return null;
  }
}

/** nonce -> paymentId mapping so the payer can return from YooKassa without
 *  a cookie or account; the nonce is a random client-generated reference. */
export async function setNonceMapping(nonce: string, paymentId: string): Promise<void> {
  await redisCommand(["SET", `lpass:nonce:${nonce}`, paymentId, "EX", String(PASS_TTL_SECONDS)]);
}

export async function getPaymentIdByNonce(nonce: string): Promise<string | null> {
  const id = await redisCommand<string>(["GET", `lpass:nonce:${nonce}`]);
  return id ?? null;
}

/** Is there a live pass covering this host right now? */
export async function hasActivePass(host: string): Promise<boolean> {
  const raw = await redisCommand<string>(["GET", passHostKey(host)]);
  if (!raw) return false;
  try {
    const rec = JSON.parse(raw) as PassRecord;
    return new Date(rec.until).getTime() > Date.now();
  } catch {
    return false;
  }
}

/** Our own deployments (and the showcase case study) keep badge/PDF access
 *  without a paid pass: their badges stay lit and demo the trust seal. */
const SELF_HOSTS = new Set([
  "appseal.online",
  "appseal.vercel.app",
  "appseal.ru",
  "akulenok-tmz.ru",
]);

export function isSelfHost(host: string): boolean {
  const clean = host.replace(/^www\./i, "").toLowerCase();
  return SELF_HOSTS.has(clean);
}

/** PDF reports and the embeddable trust badge are Launch Pass benefits:
 *  unlocked by a live pass on the scanned host (or our own deployments). */
export async function hasPassAccess(host: string): Promise<boolean> {
  if (isSelfHost(host)) return true;
  return hasActivePass(host);
}

/** Daily free quota for the scan API (per IP hash, UTC-day bucket). */
export async function bumpDailyQuota(
  ipHash: string,
  limit: number,
): Promise<{ used: number; allowed: boolean }> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `quota:${ipHash}:${day}`;
  const used = (await redisCommand<number>(["INCR", key])) ?? 1;
  if (used === 1) {
    await redisCommand(["EXPIRE", key, "172800"]);
  }
  return { used, allowed: used <= limit };
}

/** Salted one-way hash: an unsalted sha256 of an IPv4 address is reversible
 *  by brute force, which would make the quota key personal data under
 *  152-FZ. The salt makes deconvolution infeasible. */
export function hashIp(ip: string): string {
  const salt = process.env.QUOTA_SALT ?? "appseal-quota-v1";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
