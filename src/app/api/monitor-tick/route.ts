import { NextRequest, NextResponse } from "next/server";
import { normalizeInputUrl } from "@/lib/scanner/url";
import { assertPublicTarget } from "@/lib/scanner/guard";
import { redisConfig, redis } from "@/lib/scanner/store";
import { hasPassAccess } from "@/lib/passes";
import { tickSecretOk } from "@/lib/sec";
import {
  WATCH_KEY,
  LAST_KEY_PREFIX,
  RESCAN_AFTER_S,
  FREE_WATCH_ZSET,
  FREE_WATCH_KEY_PREFIX,
  FREE_RESCAN_AFTER_S,
  detectDegradation,
  formatAlert,
  formatImprovement,
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
 * Free bot watches: one domain per chat (tg:watch:{chatId}), daily cadence.
 * At most one free host per tick - 48 ticks a day keep a 100-slot watchlist
 * fresh. Alerts go straight to the follower's chat, drops and improvements
 * alike. Failures never break the Launch Pass path below.
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
    const host = (await redis(cfg, ["GET", FREE_WATCH_KEY_PREFIX + chatId])) as string | null;
    if (!host) {
      await redis(cfg, ["ZREM", FREE_WATCH_ZSET, chatId]);
      return { free: "stale-chat" };
    }

    const prevRaw = (await redis(cfg, ["GET", LAST_KEY_PREFIX + host])) as string | null;
    const prev: WatchSnapshot | null = prevRaw ? (JSON.parse(prevRaw) as WatchSnapshot) : null;

    const norm = normalizeInputUrl(`https://${host}`);
    await assertPublicTarget(new URL(norm.url).hostname);
    const rec = await rescanViaScanRoute(norm.url, origin);

    // rotate even on failure so a dead host cannot starve the queue
    await redis(cfg, ["ZADD", FREE_WATCH_ZSET, String(now), chatId]);
    if (!rec || rec.status !== "done") return { free: host, error: true };

    const fails = (rec.results ?? []).filter((r) => r.status === "fail").length;
    const cur: WatchSnapshot = { grade: rec.grade, score: rec.score, fails };
    await redis(cfg, ["SET", LAST_KEY_PREFIX + host, JSON.stringify(cur), "EX", String(SNAP_TTL_S)]);

    const drop = detectDegradation(prev, cur);
    const improved = Boolean(prev && gradeIndex(cur.grade) < gradeIndex(prev.grade));
    let notified = false;
    if (drop && prev) {
      notified = await sendTelegramMessage(chatId, formatAlert(host, prev, cur));
    } else if (improved && prev) {
      notified = await sendTelegramMessage(chatId, formatImprovement(host, prev, cur));
    }
    return { free: host, grade: cur.grade, score: cur.score, alert: drop ?? (improved ? "improved" : null), notified };
  } catch (e) {
    // free-watch problems must never take the paid monitor down
    return { free: "error", detail: e instanceof Error ? e.message : String(e) };
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
  try {
    const free = await processFreeWatch(cfg, origin);

    const top = (await redis(cfg, ["ZRANGE", WATCH_KEY, "0", "0", "WITHSCORES"])) as string[] | null;
    const host = top?.[0] ?? "";
    const lastScanTs = Number(top?.[1] ?? 0);
    if (!host) {
      return NextResponse.json({ skipped: true, reason: "watchlist-empty", ...free });
    }

    const now = Date.now();
    if (now - lastScanTs < RESCAN_AFTER_S * 1000) {
      return NextResponse.json({ skipped: true, reason: "all-fresh", host, ...free });
    }

    // a lapsed pass leaves the watchlist (and loses its snapshot);
    // self-hosts (the showcase) pass unconditionally via hasPassAccess
    if (!(await hasPassAccess(host))) {
      await redis(cfg, ["ZREM", WATCH_KEY, host]);
      await redis(cfg, ["DEL", LAST_KEY_PREFIX + host]);
      return NextResponse.json({ skipped: true, reason: "pass-expired", host, ...free });
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
      return NextResponse.json({ host, error: true, ...free });
    }

    const fails = (rec.results ?? []).filter((r) => r.status === "fail").length;
    const cur: WatchSnapshot = { grade: rec.grade, score: rec.score, fails };
    await redis(cfg, ["SET", LAST_KEY_PREFIX + host, JSON.stringify(cur), "EX", String(SNAP_TTL_S)]);

    const drop = detectDegradation(prev, cur);
    let notified = false;
    if (drop && prev) {
      notified = await sendTelegramAlert(formatAlert(host, prev, cur));
    }

    return NextResponse.json({ host, grade: cur.grade, score: cur.score, fails, alert: drop, notified, ...free });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
