import { NextResponse } from "next/server";
import { redisConfig, redis, getRegistryEntries } from "@/lib/scanner/store";
import { buildDigest, buildDigestText } from "@/lib/digest";
import { sendTelegramAlert } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

const LOCK = "appmot:digest:lock";
// ~6 days: a weekly cron can never double-post even if it drifts
const LOCK_TTL_S = 6 * 24 * 3600;

/**
 * Weekly digest post (GHA cron, Monday 09:00 UTC): composes the digest from
 * the live registry and sends it to the Telegram channel. Public endpoint,
 * the week-long lock is the throttle - extra calls are no-ops.
 */
export async function GET() {
  const cfg = redisConfig();
  if (!cfg) {
    return NextResponse.json({ error: "redis backend required" }, { status: 503 });
  }
  const lock = await redis(cfg, ["SET", LOCK, "1", "EX", String(LOCK_TTL_S), "NX"]);
  if (lock !== "OK") {
    return NextResponse.json({ skipped: true, reason: "rate-locked" });
  }
  try {
    const entries = await getRegistryEntries();
    const d = buildDigest(entries);
    const text = buildDigestText(d);
    const sent = await sendTelegramAlert(text);
    return NextResponse.json({
      ok: true,
      sent,
      weekScans: d.weekScans,
      improvers: d.improvers.length,
      anonymousImproved: d.anonymousImproved,
      newcomers: d.newA.length,
    });
  } catch (e) {
    // release the lock so a transient failure can retry on the next call
    await redis(cfg, ["DEL", LOCK]).catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
