import { NextRequest, NextResponse } from "next/server";
import { redis, redisConfig } from "@/lib/scanner/store";
import { secretsMatch } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off ops utility for the PG history backfill: paginates the ephemeral
 * scan records (appmot:scan:*, TTL 7 days) server-side, where the Upstash
 * round-trip is reliable, and hands the raw JSONs to the authenticated
 * operator. The local network path to Upstash resets on anything above ~10KB,
 * which made running the same SCAN/MGET loop from the office machine
 * impossible. Read-only, secret-gated, fixed pattern, digit-only cursor.
 */
const SCAN_PATTERN = "appmot:scan:*";
const SCAN_COUNT = 200;
const CURSOR_RE = /^\d{1,20}$/;

export async function GET(req: NextRequest) {
  const key = (process.env.ADMIN_SCAN_KEY ?? "").trim();
  if (!key) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "").trim();
  if (!secretsMatch(auth, key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cursorParam = req.nextUrl.searchParams.get("cursor") ?? "0";
  if (!CURSOR_RE.test(cursorParam)) {
    return NextResponse.json({ error: "bad cursor" }, { status: 400 });
  }

  const cfg = redisConfig();
  if (!cfg) {
    return NextResponse.json({ error: "no redis" }, { status: 503 });
  }

  let cursor = cursorParam;
  let keys: string[] = [];
  // skip empty SCAN pages so the caller never has to loop on no-op answers
  try {
    for (let guard = 0; guard < 50; guard++) {
      const res = (await redis(cfg, ["SCAN", cursor, "MATCH", SCAN_PATTERN, "COUNT", String(SCAN_COUNT)])) as [string, string[]];
      cursor = res[0];
      keys = res[1] ?? [];
      if (keys.length > 0 || cursor === "0") break;
    }
    const values = keys.length > 0 ? ((await redis(cfg, ["MGET", ...keys])) as (string | null)[]) : [];
    const items = keys
      .map((k, i) => ({ k, v: values[i] }))
      .filter((it): it is { k: string; v: string } => typeof it.v === "string");
    return NextResponse.json({ cursor, items });
  } catch {
    return NextResponse.json({ error: "redis failure" }, { status: 502 });
  }
}
