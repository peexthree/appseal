import { NextRequest, NextResponse } from "next/server";
import { normalizeInputUrl } from "@/lib/scanner/url";
import { assertPublicTarget } from "@/lib/scanner/guard";
import { redisConfig, redis } from "@/lib/scanner/store";
import { hasPassAccess, listPaidPasses, getPassChat, redisCommand } from "@/lib/passes";
import { tickSecretOk } from "@/lib/sec";
import {
  WATCH_KEY,
  LAST_KEY_PREFIX,
  RESCAN_AFTER_S,
  FREE_WATCH_ZSET,
  FREE_WATCH_KEY_PREFIX,
  FREE_RESCAN_AFTER_S,
  parseWatchHosts,
  detectDegradation,
  formatAlertRich,
  formatImprovement,
  formatNewChecks,
  newCheckIds,
  gradeIndex,
  type WatchSnapshot,
} from "@/lib/watch";
import { sendTelegramAlert, sendTelegramMessage } from "@/lib/telegram";
import type { ScanResult } from "@/lib/scanner/types";

export const runtime = "nodejs";
// submit + poll a full rescan (15-40s) within this window
export const maxDuration = 60;

const LOCK = "lpass:monitor:lock";
const MIN_INTERVAL_S = 1500; // tick throttle; the scheduler fires every 30 min
const SNAP_TTL_S = 11 * 24 * 3600; // outlives the 8-day pass TTL
const POLL_DEADLINE_MS = 48_000; // leave headroom under maxDuration
const POLL_INTERVAL_MS = 2500;
const SUBMIT_TIMEOUT_MS = 30_000; // a hung scan-route submit must not eat the poll budget

/* --- expiry reminders: warn the bound chat 3..1 days before a pass dies --- */
const REMIND_PREFIX = "lpass:reminded:";
const REMINDER_MAX_DAYS = 3;

/* --- free re-scan nudge: one "did you fix it?" message per bot scan ------ */
const LASTSCAN_PREFIX = "tg:lastscan:";
const NUDGE_AFTER_MS = 48 * 3600 * 1000;
const NUDGE_TTL_S = 5 * 24 * 3600;

/** Self-origin to loop the scan route through: NEXT_PUBLIC_APP_URL when set,
 *  otherwise the origin this request arrived on (new URL(req.url).origin). */
function appOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
}

/**
 * Launch Pass background monitor (driven by GHA cron every 30 min).
 *
 * Each tick takes the watched host scanned longest ago (ZSET score =
 * last-scan timestamp), rescans it through the scan route, compares with the
 * previous snapshot and sends a Telegram alert when the grade drops, the
 * score falls by 10+ points or the fail count spikes by 3+.
 *
 * The tick deliberately does NOT run the scanner inline: the engine (with
 * its ~80 MB browser bundle) lives only in /api/scan, so every deployment
 * ships it once instead of three times (Vercel Functions Storage quota).
 * A rescan published through the scan route also lands in the public
 * registry - watched hosts honestly refresh in the catalog.
 *
 * - A host whose pass has expired leaves the watchlist (honest degradation);
 * - A scan error rotates the host back without alerting (no false positives
 *   on transient timeouts);
 * - No TELEGRAM_* env vars -> scans still run, alerts are skipped.
 *
 * Two side duties run on every tick, independent of the watchlist state and
 * swallowing their own errors: pass expiry reminders (3..1 days left) and the
 * free re-scan nudge for bot chats that scanned 48h+ ago and never returned.
 */

/**
 * Submit a target to the scan route over HTTP (admin key bypasses the free
 * quota for machine-triggered scans) and poll until it finishes. The origin
 * comes from NEXT_PUBLIC_APP_URL or the request itself - no hardcoded
 * deployment host. A timed-out submit throws; a failed poll returns null.
 */
async function rescanViaScanRoute(url: string, origin: string): Promise<ScanResult | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SUBMIT_TIMEOUT_MS);
  let ok = false;
  let status = 0;
  let d: { id?: string; rkey?: string; error?: string };
  try {
    const res = await fetch(origin + "/api/scan", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "AppSeal-Tick/0.1 (+https://appseal.online/bot)",
      },
      body: JSON.stringify({ url, lang: "ru", adminKey: process.env.ADMIN_SCAN_KEY ?? "" }),
      signal: ac.signal,
    });
    ok = res.ok;
    status = res.status;
    d = (await res.json().catch(() => ({}))) as { id?: string; rkey?: string; error?: string };
  } catch (e) {
    throw new Error(`scan submit failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!ok || !d.id || !d.rkey) {
    throw new Error(d.error ?? `scan submit failed: ${status}`);
  }
  // both values are server-generated (id = uuid-like, rkey = 32 hex); the
  // format check keeps malformed responses from ever reaching the poll URL
  if (!/^[a-z0-9-]{6,40}$/i.test(d.id) || !/^[a-f0-9]{32}$/.test(d.rkey)) {
    throw new Error("scan submit returned malformed id/rkey");
  }

  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const pres = await fetch(origin + "/api/scan/" + d.id + "?key=" + d.rkey, {
        cache: "no-store",
        headers: { "user-agent": "AppSeal-Tick/0.1 (+https://appseal.online/bot)" },
      });
      if (!pres.ok) continue;
      const rec = (await pres.json()) as ScanResult;
      if (rec.status === "done" || rec.status === "error") return rec;
    } catch {
      /* transient hiccup - keep polling until the deadline */
    }
  }
  return null; // did not finish in time - caller reports an honest error
}

/**
 * Free bot watches: up to FREE_PER_CHAT_MAX domains per chat
 * (tg:watch:{chatId} = JSON {"hosts":[...]}; a legacy bare string counts as
 * one host), daily cadence. At most one free host per tick - the chat's own
 * list rotates (scanned host moves to the back), the ZSET rotation across
 * chats stays as-is; 48 ticks a day keep a 100-slot watchlist fresh. Alerts
 * go straight to the follower's chat, drops and improvements alike, with the
 * concrete fail diff when the previous snapshot carried ids. Failures never
 * break the Launch Pass path below.
 */
async function processFreeWatch(
  cfg: NonNullable<ReturnType<typeof redisConfig>>,
  origin: string,
): Promise<Record<string, unknown>> {
  try {
    const top = (await redis(cfg, ["ZRANGE", FREE_WATCH_ZSET, "0", "0", "WITHSCORES"])) as string[] | null;
    const chatId = top?.[0] ?? "";
    const lastTs = Number(top?.[1] ?? 0);
    if (!chatId) return { free: "none" };
    const now = Date.now();
    if (now - lastTs < FREE_RESCAN_AFTER_S * 1000) return { free: "fresh" };
    // this tick scans the chat's first host - the rotation below gives every
    // host of the chat its turn across ticks (oldest-check-first simplified
    // to array order, exactly as the free tier promises)
    const hosts = parseWatchHosts(((await redis(cfg, ["GET", FREE_WATCH_KEY_PREFIX + chatId])) as string | null) ?? "");
    if (hosts.length === 0) {
      await redis(cfg, ["ZREM", FREE_WATCH_ZSET, chatId]);
      return { free: "stale-chat" };
    }
    const host = hosts[0];

    const prevRaw = (await redis(cfg, ["GET", LAST_KEY_PREFIX + host])) as string | null;
    const prev: WatchSnapshot | null = prevRaw ? (JSON.parse(prevRaw) as WatchSnapshot) : null;

    const norm = normalizeInputUrl(`https://${host}`);
    await assertPublicTarget(new URL(norm.url).hostname);
    const rec = await rescanViaScanRoute(norm.url, origin);

    // rotate even on failure so a dead host cannot starve the queue
    await redis(cfg, ["ZADD", FREE_WATCH_ZSET, String(now), chatId]);
    if (!rec || rec.status !== "done") return { free: host, error: true };

    const results = rec.results ?? [];
    const fails = results.filter((r) => r.status === "fail").length;
    const cur: WatchSnapshot = {
      grade: rec.grade,
      score: rec.score,
      fails,
      ids: results.filter((r) => r.status === "fail").map((r) => r.id),
    };
    await redis(cfg, ["SET", LAST_KEY_PREFIX + host, JSON.stringify(cur), "EX", String(SNAP_TTL_S)]);
    // scanned host to the back of the chat's own list; a legacy string value
    // is migrated to the JSON shape on this same write
    const rotated = [...hosts.slice(1), host];
    await redis(cfg, ["SET", FREE_WATCH_KEY_PREFIX + chatId, JSON.stringify({ hosts: rotated })]);

    const drop = detectDegradation(prev, cur);
    const improved = Boolean(prev && gradeIndex(cur.grade) < gradeIndex(prev.grade));
    let notified = false;
    if (drop && prev) {
      // without ids in the previous snapshot the rich formatter degrades to
      // the plain one-line alert by itself
      notified = await sendTelegramMessage(chatId, formatAlertRich(host, prev, cur, results));
    } else if (improved && prev) {
      notified = await sendTelegramMessage(chatId, formatImprovement(host, prev, cur));
    }
    // engine-growth notice: a separate message in the same chat, fired once
    // per engine update - the snapshot stored above already carries the new
    // ids, so the next tick cannot re-fire it
    const newIds = newCheckIds(prev?.ids, results.map((r) => r.id));
    let newChecksNotified = false;
    if (prev && newIds.length > 0) {
      const newSet = new Set(newIds);
      const passed = results.filter((r) => r.status === "pass" && newSet.has(r.id)).length;
      newChecksNotified = await sendTelegramMessage(chatId, formatNewChecks(newIds.length, passed));
    }
    return {
      free: host,
      watched: hosts.length,
      grade: cur.grade,
      score: cur.score,
      alert: drop ?? (improved ? "improved" : null),
      notified,
      newChecks: newIds.length,
      newChecksNotified,
    };
  } catch (e) {
    // free-watch problems must never take the paid monitor down
    return { free: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Pass expiry reminders: every paid watchlist host with 1..3 days left gets
 * ONE warning - the bound chat hears it personally, a web-only purchase
 * falls back to the channel. The lpass:reminded:{host} marker is written
 * only after a successful send (a Telegram hiccup retries on the next tick)
 * with a TTL covering the remaining days plus an hour of grace. Swallows its
 * own errors - the monitor path below must never depend on this block.
 */
async function remindExpiringPasses(): Promise<number> {
  try {
    const passes = await listPaidPasses();
    let sent = 0;
    for (const p of passes) {
      const daysLeft = Math.ceil((new Date(p.until).getTime() - Date.now()) / 86_400_000);
      if (!(daysLeft > 0 && daysLeft <= REMINDER_MAX_DAYS)) continue;
      const marker = REMIND_PREFIX + p.host;
      if (await redisCommand<string>(["GET", marker])) continue;
      const text = `⏳ Пасс на ${p.host} истекает через ${daysLeft} дн. Продлить: /plan_pro в боте или на appseal.online`;
      const ok = p.chatId
        ? await sendTelegramMessage(p.chatId, text)
        : await sendTelegramAlert(text);
      if (ok) {
        await redisCommand(["SET", marker, "1", "EX", String(daysLeft * 86_400 + 3600)]);
        sent += 1;
      }
    }
    return sent;
  } catch {
    return 0;
  }
}

/**
 * Free re-scan loop closer: a chat that ran a free bot scan (tg:lastscan
 * record written by the bot) 48h+ ago and has not returned since gets one
 * nudge to re-check the domain it was "fixing". The record is flipped to
 * nudged:true afterwards, so each scan produces at most one nudge; the TTL
 * then expires the key within days. One cursor-0 SCAN call is enough at
 * real volumes - no pagination. Swallows its own errors.
 */
async function nudgeStaleScans(): Promise<number> {
  try {
    const page = await redisCommand<unknown>(["SCAN", "0", "MATCH", LASTSCAN_PREFIX + "*", "COUNT", "200"]);
    // Upstash REST shape: [cursor, [key, ...]]
    const keys = Array.isArray(page) && Array.isArray(page[1]) ? (page[1] as string[]) : [];
    if (keys.length === 0) return 0;
    const values = (await redisCommand<string[]>(["MGET", ...keys])) ?? [];
    let sent = 0;
    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      let rec: { host?: string; ts?: number; nudged?: boolean };
      try {
        rec = JSON.parse(raw) as { host?: string; ts?: number; nudged?: boolean };
      } catch {
        continue;
      }
      if (rec.nudged || typeof rec.ts !== "number" || Date.now() - rec.ts < NUDGE_AFTER_MS) continue;
      const host = typeof rec.host === "string" ? rec.host : "";
      const chatId = keys[i].slice(LASTSCAN_PREFIX.length);
      if (!host || !/^-?\d{3,20}$/.test(chatId)) continue;
      const ok = await sendTelegramMessage(
        chatId,
        `🛠 Чинили ${host}? Перепроверим бесплатно - пришлите домен или /scan ${host}`,
      );
      if (ok) {
        await redisCommand(["SET", keys[i], JSON.stringify({ host, ts: rec.ts, nudged: true }), "EX", String(NUDGE_TTL_S)]);
        sent += 1;
      }
    }
    return sent;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  // TICK_SECRET configured -> the scheduler must present it (header or
  // ?secret=, constant-time compare); unset -> public as before
  if (!tickSecretOk(req.headers, req.url, process.env.TICK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = redisConfig();
  if (!cfg) {
    return NextResponse.json({ error: "redis backend required" }, { status: 503 });
  }

  // public endpoint: the lock is the throttle - extra calls are no-ops
  const lock = await redis(cfg, ["SET", LOCK, "1", "EX", String(MIN_INTERVAL_S), "NX"]);
  if (lock !== "OK") {
    return NextResponse.json({ skipped: true, reason: "rate-locked" });
  }

  const origin = appOrigin(req);
  // side duties first: they must run even when the watchlist below returns
  // early (empty / all-fresh / expired); both blocks swallow their errors
  const reminders = await remindExpiringPasses();
  const nudges = await nudgeStaleScans();
  try {
    const free = await processFreeWatch(cfg, origin);

    const top = (await redis(cfg, ["ZRANGE", WATCH_KEY, "0", "0", "WITHSCORES"])) as string[] | null;
    const host = top?.[0] ?? "";
    const lastScanTs = Number(top?.[1] ?? 0);
    if (!host) {
      return NextResponse.json({ skipped: true, reason: "watchlist-empty", reminders, nudges, ...free });
    }

    const now = Date.now();
    if (now - lastScanTs < RESCAN_AFTER_S * 1000) {
      return NextResponse.json({ skipped: true, reason: "all-fresh", host, reminders, nudges, ...free });
    }

    // a lapsed pass leaves the watchlist (and loses its snapshot);
    // self-hosts (the showcase) pass unconditionally via hasPassAccess
    if (!(await hasPassAccess(host))) {
      // farewell before the removal: the bound chat hears it personally,
      // a web-only purchase falls back to the channel; the removal itself
      // happens regardless of the send outcome
      let farewell = false;
      try {
        const chatId = await getPassChat(host);
        const bye = `Пасс на ${host} закончился, домен снят с наблюдения. Продлить: /plan_pro`;
        farewell = chatId ? await sendTelegramMessage(chatId, bye) : await sendTelegramAlert(bye);
      } catch {
        /* never block the removal */
      }
      await redis(cfg, ["ZREM", WATCH_KEY, host]);
      await redis(cfg, ["DEL", LAST_KEY_PREFIX + host]);
      return NextResponse.json({ skipped: true, reason: "pass-expired", host, farewell, reminders, nudges, ...free });
    }

    const prevRaw = (await redis(cfg, ["GET", LAST_KEY_PREFIX + host])) as string | null;
    const prev: WatchSnapshot | null = prevRaw ? (JSON.parse(prevRaw) as WatchSnapshot) : null;

    // rescan through the scan route: same engine as the user-facing scan
    const inputUrl = `https://${host}`;
    const norm = normalizeInputUrl(inputUrl);
    await assertPublicTarget(new URL(norm.url).hostname);
    const rec = await rescanViaScanRoute(norm.url, origin);

    // rotate regardless of the outcome so a dead site cannot hog the queue
    await redis(cfg, ["ZADD", WATCH_KEY, String(now), host]);

    if (!rec || rec.status !== "done") {
      return NextResponse.json({ host, error: true, reminders, nudges, ...free });
    }

    const results = rec.results ?? [];
    const fails = results.filter((r) => r.status === "fail").length;
    const cur: WatchSnapshot = {
      grade: rec.grade,
      score: rec.score,
      fails,
      ids: results.filter((r) => r.status === "fail").map((r) => r.id),
    };
    await redis(cfg, ["SET", LAST_KEY_PREFIX + host, JSON.stringify(cur), "EX", String(SNAP_TTL_S)]);

    const drop = detectDegradation(prev, cur);
    let notified = false;
    if (drop && prev) {
      // channel alert for paid hosts; the rich formatter appends the fail
      // diff only when the previous snapshot carried ids
      notified = await sendTelegramAlert(formatAlertRich(host, prev, cur, results));
    }
    // engine-growth notice for the channel, same once-per-update semantics
    const newIds = newCheckIds(prev?.ids, results.map((r) => r.id));
    let newChecksNotified = false;
    if (prev && newIds.length > 0) {
      const newSet = new Set(newIds);
      const passed = results.filter((r) => r.status === "pass" && newSet.has(r.id)).length;
      newChecksNotified = await sendTelegramAlert(formatNewChecks(newIds.length, passed));
    }

    return NextResponse.json({
      host,
      grade: cur.grade,
      score: cur.score,
      fails,
      alert: drop,
      notified,
      newChecks: newIds.length,
      newChecksNotified,
      reminders,
      nudges,
      ...free,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
