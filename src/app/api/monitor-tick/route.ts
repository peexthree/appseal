import { NextResponse } from "next/server";
import { runScan, normalizeInputUrl } from "@/lib/scanner";
import { assertPublicTarget } from "@/lib/scanner/guard";
import {
  newId,
  newReportKey,
  saveScan,
  serializeScan,
  getScan,
  redisConfig,
  redis,
} from "@/lib/scanner/store";
import { hasActivePass } from "@/lib/passes";
import {
  WATCH_KEY,
  LAST_KEY_PREFIX,
  RESCAN_AFTER_S,
  detectDegradation,
  formatAlert,
  type WatchSnapshot,
} from "@/lib/watch";
import { sendTelegramAlert } from "@/lib/telegram";
import type { Lang, ScanResult } from "@/lib/scanner/types";

export const runtime = "nodejs";
// one rescan takes 15-40s
export const maxDuration = 60;

const LOCK = "lpass:monitor:lock";
const MIN_INTERVAL_S = 1500; // tick throttle; the scheduler fires every 30 min
const SNAP_TTL_S = 11 * 24 * 3600; // outlives the 8-day pass TTL

/**
 * Launch Pass background monitor (driven by GHA cron every 30 min).
 *
 * Each tick takes the watched host scanned longest ago (ZSET score =
 * last-scan timestamp), rescans it with the same engine, compares with the
 * previous snapshot and sends a Telegram alert when the grade drops, the
 * score falls by 10+ points or the fail count spikes by 3+.
 *
 * - A host whose pass has expired leaves the watchlist (honest degradation);
 * - A scan error rotates the host back without alerting (no false positives
 *   on transient timeouts);
 * - No TELEGRAM_* env vars -> scans still run, alerts are skipped.
 */
export async function GET() {
  const cfg = redisConfig();
  if (!cfg) {
    return NextResponse.json({ error: "redis backend required" }, { status: 503 });
  }

  // public endpoint: the lock is the throttle - extra calls are no-ops
  const lock = await redis(cfg, ["SET", LOCK, "1", "EX", String(MIN_INTERVAL_S), "NX"]);
  if (lock !== "OK") {
    return NextResponse.json({ skipped: true, reason: "rate-locked" });
  }

  try {
    const top = (await redis(cfg, ["ZRANGE", WATCH_KEY, "0", "0", "WITHSCORES"])) as string[] | null;
    const host = top?.[0] ?? "";
    const lastScanTs = Number(top?.[1] ?? 0);
    if (!host) {
      return NextResponse.json({ skipped: true, reason: "watchlist-empty" });
    }

    const now = Date.now();
    if (now - lastScanTs < RESCAN_AFTER_S * 1000) {
      return NextResponse.json({ skipped: true, reason: "all-fresh", host });
    }

    // a lapsed pass leaves the watchlist (and loses its snapshot)
    if (!(await hasActivePass(host))) {
      await redis(cfg, ["ZREM", WATCH_KEY, host]);
      await redis(cfg, ["DEL", LAST_KEY_PREFIX + host]);
      return NextResponse.json({ skipped: true, reason: "pass-expired", host });
    }

    const prevRaw = (await redis(cfg, ["GET", LAST_KEY_PREFIX + host])) as string | null;
    const prev: WatchSnapshot | null = prevRaw ? (JSON.parse(prevRaw) as WatchSnapshot) : null;

    // rescan inline: same engine as the user-facing scan
    const inputUrl = `https://${host}`;
    const norm = normalizeInputUrl(inputUrl);
    await assertPublicTarget(new URL(norm.url).hostname);
    const scanId = newId();
    const scan: ScanResult = {
      id: scanId,
      inputUrl,
      targetUrl: norm.url,
      host: new URL(norm.url).hostname,
      isDemo: false,
      lang: "ru" as Lang,
      startedAt: new Date().toISOString(),
      finishedAt: "",
      status: "running",
      progress: 2,
      stage: { ru: "Фоновый перескан…", en: "Background rescan…" },
      score: 0,
      grade: "E",
      results: [],
      rkey: newReportKey(),
    };
    await saveScan(scanId, serializeScan(scan));
    const fin = await runScan(scan);

    // rotate regardless of the outcome so a dead site cannot hog the queue
    await redis(cfg, ["ZADD", WATCH_KEY, String(now), host]);

    if (!fin) {
      return NextResponse.json({ host, error: true });
    }

    const saved = await getScan(scanId);
    const fails = (saved?.results ?? []).filter((r) => r.status === "fail").length;
    const cur: WatchSnapshot = { grade: fin.grade, score: fin.score, fails };
    await redis(cfg, ["SET", LAST_KEY_PREFIX + host, JSON.stringify(cur), "EX", String(SNAP_TTL_S)]);

    const drop = detectDegradation(prev, cur);
    let notified = false;
    if (drop && prev) {
      notified = await sendTelegramAlert(formatAlert(host, prev, cur));
    }

    return NextResponse.json({ host, grade: cur.grade, score: cur.score, fails, alert: drop, notified });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
