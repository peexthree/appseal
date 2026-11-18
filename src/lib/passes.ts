/**
 * Launch Pass store: one paid pass = one domain, unlimited scans for a fixed
 * term - 7 days (Launch Pass) or 30 days (Pro Pass). The key layout is shared
 * (lp-style lpass:{pay,host}:... keys); the record itself carries `days`.
 *
 * Redis-only (Upstash REST, same env vars as the scan store): passes are
 * payment-backed data, they must survive restarts and never fall back to a
 * writable local file. If Redis is absent the feature degrades to "no
 * passes" instead of failing the scan flow.
 */

import { createHash, randomUUID } from "node:crypto";
import { WATCH_KEY } from "./watch.ts";
import { mirrorPass } from "./db/index.ts";

const DEFAULT_PASS_DAYS = 7;
export const PRO_PASS_DAYS = 30;
/** mapping TTLs keep the old 8-day window (7-day pass + 1 day of grace) */
const PASS_TTL_SECONDS = 8 * 24 * 3600;

/** Redis TTL for a pass record: the pass term + 1 day of grace */
function passTtlSeconds(days: number): number {
  return (days + 1) * 24 * 3600;
}

// 152-FZ data localization (part 5, art. 18): storing payer emails here would
// require an RF-hosted database. The email goes to YooKassa for the receipt
// and is NEVER written to our store - only non-personal references (payment
// id, domain, expiry) stay.
export interface PassRecord {
  paymentId: string;
  host: string;
  until: string; // ISO timestamp
  /** pass length in days (7 = Launch, 30 = Pro); legacy records may omit it */
  days?: number;
}

/** Payment kind (YooKassa metadata) -> pass length: "lpro" is the 30-day
 *  Pro Pass, anything else activates a 7-day Launch Pass. */
export function daysForKind(kind?: string): number {
  return kind === "lpro" ? PRO_PASS_DAYS : DEFAULT_PASS_DAYS;
}

/** Lava invoices carry no metadata, so the Pro marker rides in the
 *  invoice->host map as "pro:<host>" (the pack uses "pack:<chatId>").
 *  Returns the host for a well-formed Pro marker, null otherwise. */
export function proHostFromLavaMarker(marker: string): string | null {
  if (!marker.startsWith("pro:")) return null;
  const host = marker.slice(4).trim().toLowerCase();
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
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

/** Upstash REST call (pinned to https + *.upstash.io). Also used by the
 *  Telegram bot webhook for per-chat purchase state. */
export async function redisCommand<T>(command: string[]): Promise<T | null> {
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

/** days defaults to the 7-day Launch Pass; the Pro Pass activates with 30 */
export async function activatePass(paymentId: string, host: string, days: number = DEFAULT_PASS_DAYS): Promise<PassRecord> {
  const d = Number.isFinite(days) && days >= 1 && days <= 365 ? Math.floor(days) : DEFAULT_PASS_DAYS;
  const record: PassRecord = {
    paymentId,
    host: host.replace(/^www\./i, "").toLowerCase(),
    until: new Date(Date.now() + d * 24 * 3600 * 1000).toISOString(),
    days: d,
  };
  const ttl = passTtlSeconds(d);
  await redisCommand(["SET", `lpass:pay:${paymentId}`, JSON.stringify(record), "EX", String(ttl)]);
  await redisCommand(["SET", passHostKey(record.host), JSON.stringify(record), "EX", String(ttl)]);
  // paid hosts join the background watchlist; score 0 = rescan ASAP
  await redisCommand(["ZADD", WATCH_KEY, "0", record.host]);
  // durable mirror (no-op without DATABASE_URL); never blocks activation
  void mirrorPass(record);
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

/** Lava.top invoice -> host binding: the webhook and the return-page poll both
 *  use it to activate the pass (Lava invoices carry no metadata, so we store
 *  the host at invoice creation time). */
export async function setLavaInvoiceHost(invoiceId: string, host: string): Promise<void> {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(invoiceId)) return;
  await redisCommand(["SET", `lpass:lava-inv:${invoiceId}`, host, "EX", String(PASS_TTL_SECONDS)]);
}

export async function getLavaInvoiceHost(invoiceId: string): Promise<string | null> {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(invoiceId)) return null;
  const host = await redisCommand<string>(["GET", `lpass:lava-inv:${invoiceId}`]);
  return host ?? null;
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

/* ------------------------------------------------------------------ */
/* Chat <-> pass binding: personal alerts, digests, expiry reminders   */
/* ------------------------------------------------------------------ */

/** The bot binds the chat right after a payment check succeeds (webhook
 *  activations have no chat context). Two directions are written:
 *  host -> chat (alerts/digest/reminders) and chat -> hosts (Pro lookup,
 *  e.g. /token). TTL covers the longest pass + ample grace. */
const BIND_TTL_SECONDS = 45 * 24 * 3600;
const CHAT_ID_RE = /^-?\d{3,20}$/;

export async function bindPassChat(host: string, chatId: string): Promise<void> {
  const clean = host.replace(/^www\./i, "").toLowerCase();
  if (!CHAT_ID_RE.test(chatId.trim())) return;
  const id = chatId.trim();
  await redisCommand(["SET", `tg:passchat:${passHostKey(clean).slice("lpass:host:".length)}`, id, "EX", String(BIND_TTL_SECONDS)]);
  await redisCommand(["SADD", `tg:chatpass:${id}`, clean]);
  await redisCommand(["EXPIRE", `tg:chatpass:${id}`, String(BIND_TTL_SECONDS)]);
}

/** chat bound to this host's pass (null for web-only purchases). */
export async function getPassChat(host: string): Promise<string | null> {
  const raw = await redisCommand<string>(["GET", `tg:passchat:${passHostKey(host).slice("lpass:host:".length)}`]);
  return raw ?? null;
}

/** Hosts the chat has ever bound (pack redemptions + bot purchases). */
export async function getChatPassHosts(chatId: string): Promise<string[]> {
  if (!CHAT_ID_RE.test(chatId.trim())) return [];
  const raw = await redisCommand<string[]>(["SMEMBERS", `tg:chatpass:${chatId.trim()}`]);
  return Array.isArray(raw) ? raw.filter((h) => typeof h === "string" && h.length > 0) : [];
}

/** Full pass record for a host (kind/days live here, not just the boolean). */
export async function getPassRecord(host: string): Promise<PassRecord | null> {
  const raw = await redisCommand<string>(["GET", passHostKey(host)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PassRecord;
  } catch {
    return null;
  }
}

export interface PaidPassSummary {
  host: string;
  chatId: string | null;
  until: string;
  days?: number;
}

/** Every currently watched paid host with its bound chat (personal digest,
 *  expiry reminders). Cheap enough at real watchlist sizes (< 100 hosts). */
export async function listPaidPasses(): Promise<PaidPassSummary[]> {
  const hosts = await redisCommand<string[]>(["ZRANGE", WATCH_KEY, "0", "-1"]);
  if (!Array.isArray(hosts) || hosts.length === 0) return [];
  const out: PaidPassSummary[] = [];
  for (const host of hosts) {
    if (typeof host !== "string" || !host) continue;
    const [rec, chatId] = await Promise.all([getPassRecord(host), getPassChat(host)]);
    if (rec) out.push({ host, chatId, until: rec.until, days: rec.days });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Agency Pack: 5 pass-credits bought at once, redeemed per domain     */
/* ------------------------------------------------------------------ */

export const PACK_CREDITS = 5;
/** 30 days to redeem all credits after the pack purchase */
const PACK_TTL_SECONDS = 30 * 24 * 3600;

export async function grantPackCredits(paymentId: string, credits = PACK_CREDITS): Promise<void> {
  await redisCommand(["SET", `lpack:credits:${paymentId}`, String(credits), "EX", String(PACK_TTL_SECONDS)]);
}

/** Idempotent grant: SET NX marker first, credits only when it won the race.
 *  Both the webhook and the ?paid= return path call this - without the marker
 *  a return-visit GET would refill an already redeemed pack. */
export async function ensurePackGranted(paymentId: string): Promise<boolean> {
  const won = await redisCommand<string>([
    "SET",
    `lpack:granted:${paymentId}`,
    "1",
    "EX",
    String(PACK_TTL_SECONDS),
    "NX",
  ]);
  if (!won) return false;
  await grantPackCredits(paymentId);
  return true;
}

export async function getPackCredits(paymentId: string): Promise<number> {
  const raw = await redisCommand<string>(["GET", `lpack:credits:${paymentId}`]);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Atomically consume one credit. The check-and-decrement runs as a single
 *  Lua script: a concurrent redeem can never drive the counter below zero
 *  (two separate DECR/INCR round-trips would race and leak a credit).
 *  Returns 1 = consumed, 0 = exhausted, -1 = no pack for this payment. */
const CONSUME_CREDIT_LUA = `
local v = redis.call('GET', KEYS[1])
if not v then return -1 end
if tonumber(v) < 1 then return 0 end
redis.call('DECR', KEYS[1])
return 1
`;

export async function consumePackCredit(paymentId: string): Promise<boolean> {
  const res = await redisCommand<number>(["EVAL", CONSUME_CREDIT_LUA, "1", `lpack:credits:${paymentId}`]);
  if (res === null) {
    // Upstash hiccup: fall back to the (racy but correct-on-success) DECR/INCR pair
    const left = await redisCommand<number>(["DECR", `lpack:credits:${paymentId}`]);
    if (left === null) return false;
    if (left < 0) {
      await redisCommand(["INCR", `lpack:credits:${paymentId}`]);
      return false;
    }
    return true;
  }
  return res === 1;
}

/** chat -> pack payment reference so /redeem works days after the payment */
export async function setChatPack(chatId: string, paymentId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(chatId) || !/^[A-Za-z0-9:_-]{8,120}$/.test(paymentId)) return;
  await redisCommand(["SET", `tg:pack:${chatId}`, paymentId, "EX", String(PACK_TTL_SECONDS)]);
}

export async function getChatPack(chatId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(chatId)) return null;
  const raw = await redisCommand<string>(["GET", `tg:pack:${chatId}`]);
  return raw ?? null;
}

/** Redeemed hosts per chat (the /myscans data source): single purchases carry
 *  no chat binding, but a pack redemption always happens inside a bot chat -
 *  remember the hosts there so the chat can list its own domains. SADD + a
 *  refreshed pack-TTL EXPIRE keeps the set alive while credits may still
 *  be redeemed. */
export async function addChatRedeemedHost(chatId: string, host: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(chatId)) return;
  const clean = host.replace(/^www\./i, "").toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(clean)) return;
  await redisCommand(["SADD", `tg:redeem:${chatId}`, clean]);
  await redisCommand(["EXPIRE", `tg:redeem:${chatId}`, String(PACK_TTL_SECONDS)]);
}

export async function getChatRedeemedHosts(chatId: string): Promise<string[]> {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(chatId)) return [];
  const raw = await redisCommand<string[]>(["SMEMBERS", `tg:redeem:${chatId}`]);
  return Array.isArray(raw) ? raw.filter((h) => typeof h === "string" && h.length > 0) : [];
}

/** Redeem one pack credit onto a host: unique pass record per redemption. */
export async function redeemPackPass(paymentId: string, host: string): Promise<PassRecord> {
  const clean = host.replace(/^www\./i, "").toLowerCase();
  return activatePass(`${paymentId}:${clean.slice(0, 24)}`, clean);
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

/** Daily free quota for the scan API (per IP hash, UTC-day bucket).
 *  The TTL is pinned by an atomic SET NX first, then INCR counts: the old
 *  INCR-then-EXPIRE pair could lose the expire to a crash or an Upstash
 *  hiccup between the two commands, leaving a TTL-less key that ate the
 *  daily counter forever. The first INCR after SET "0" NX still returns 1. */
export async function bumpDailyQuota(
  ipHash: string,
  limit: number,
): Promise<{ used: number; allowed: boolean }> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `quota:${ipHash}:${day}`;
  await redisCommand(["SET", key, "0", "EX", "172800", "NX"]);
  const used = (await redisCommand<number>(["INCR", key])) ?? 1;
  return { used, allowed: used <= limit };
}

/** Salted one-way hash: an unsalted sha256 of an IPv4 address is reversible
 *  by brute force, which would make the quota key personal data under
 *  152-FZ. The salt makes deconvolution infeasible. QUOTA_SALT is preferred;
 *  without it the salt is derived from a runtime secret - never a publicly
 *  known constant (a random per-process fallback only loses bucket
 *  consistency across instances, it does not expose quota keys). */
export function hashIp(ip: string): string {
  let salt = process.env.QUOTA_SALT ?? "";
  if (!salt) {
    const src =
      process.env.UPSTASH_REDIS_REST_TOKEN ??
      process.env.TELEGRAM_WEBHOOK_SECRET ??
      process.env.ADMIN_SCAN_KEY ??
      randomUUID();
    salt = createHash("sha256").update(`quota-salt:${src}`).digest("hex");
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Final-result cache for the ?paid=<nonce> return flow                */
/* ------------------------------------------------------------------ */

/** After a payment resolves successfully the nonce mapping would keep
 *  re-running activatePass/getPayment on every replay for the remaining
 *  TTL. The first successful GET stores the final answer under a second
 *  key with a 1-hour TTL: replays serve the cached result instantly and
 *  the bot's status check keeps working for the same hour. */
const NONCE_FINAL_TTL_SECONDS = 3600;

interface NonceFinal {
  status: "succeeded";
  host?: string;
  until?: string;
  pack?: boolean;
  credits?: number;
}

export async function setNonceFinal(nonce: string, result: NonceFinal): Promise<void> {
  if (!/^[a-z0-9-]{8,64}$/i.test(nonce)) return;
  await redisCommand([
    "SET",
    `lpass:nonce-final:${nonce}`,
    JSON.stringify(result),
    "EX",
    String(NONCE_FINAL_TTL_SECONDS),
  ]);
}

export async function getNonceFinal(nonce: string): Promise<NonceFinal | null> {
  if (!/^[a-z0-9-]{8,64}$/i.test(nonce)) return null;
  const raw = await redisCommand<string>(["GET", `lpass:nonce-final:${nonce}`]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NonceFinal;
  } catch {
    return null;
  }
}
