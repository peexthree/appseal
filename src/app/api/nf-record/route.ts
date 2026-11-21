import { NextResponse } from "next/server";
import { redisConfig, redis } from "@/lib/scanner/store";

/**
 * De-personalized all-time record of the 404 bug game: the best single-run
 * kill count across every visitor. Stored in Redis, only
 * ever raised; the static 404 page reads it client-side via GET and posts a
 * new score when a run beats the stored value. The page itself stays fully
 * static - this is a separate dynamic API route.
 */

const WORLD_KEY = "appmot:nf:world-record";
// sanity cap: the game is a tap-easter-egg, scores beyond this are junk posts
const CAP = 999;

export async function GET() {
  try {
    const cfg = redisConfig();
    if (!cfg) return NextResponse.json({ record: 0 });
    const val = await redis(cfg, ["GET", WORLD_KEY]);
    return NextResponse.json({ record: parseInt(String(val ?? "0"), 10) || 0 });
  } catch {
    return NextResponse.json({ record: 0 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { score?: number };
    const score = Math.floor(Number(body?.score) || 0);
    if (score < 0 || score > CAP) {
      return NextResponse.json({ error: "bad score" }, { status: 400 });
    }
    const cfg = redisConfig();
    if (!cfg) return NextResponse.json({ record: score });
    const prev = await redis(cfg, ["GET", WORLD_KEY]);
    const current = parseInt(String(prev ?? "0"), 10) || 0;
    if (score > current) {
      await redis(cfg, ["SET", WORLD_KEY, String(score)]);
    }
    return NextResponse.json({ record: Math.max(current, score) });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}
