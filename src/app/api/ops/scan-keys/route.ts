import { NextRequest, NextResponse } from "next/server";
import { redis, redisConfig } from "@/lib/scanner/store";
import { archiveScan } from "@/lib/db";
import { secretsMatch } from "@/lib/sec";
import type { ScanResult } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-off ops utility for the PG history backfill: paginates the ephemeral
 * scan records (appmot:scan:*, TTL 7 days) server-side, where both the
 * Upstash round-trip and the Supabase connection are reliable, and either
 * hands the raw JSONs to the operator (mode=read) or archives them straight
 * into the scans table via archiveScan (mode=archive). The office network
 * resets on anything above ~10KB, which made running the same loop locally
 * impossible. Read-only on Redis, secret-gated, fixed pattern, digit-only
 * cursor.
 */
const SCAN_PATTERN = "appmot:scan:*";
const SCAN_COUNT = 200;
const CURSOR_RE = /^\d{1,20}$/;
const ID_RE = /^[a-z0-9-]{6,40}$/i;
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const GRADE_RE = /^[A-E]\+?$/;

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
  const mode = req.nextUrl.searchParams.get("mode") === "archive" ? "archive" : "read";

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

    if (mode === "read") {
      return NextResponse.json({ cursor, items });
    }

    // archive mode: durable-ize every finished, non-demo record (same
    // validation and upsert shape as the scan pipeline's own archiveScan)
    let archived = 0;
    let skipped = 0;
    for (const it of items) {
      try {
        const d = JSON.parse(it.v) as ScanResult & { finishedAt?: string };
        if (d.isDemo || d.status !== "done") {
          skipped++;
          continue;
        }
        if (
          !ID_RE.test(String(d.id ?? "")) ||
          !HOST_RE.test(String(d.host ?? "")) ||
          !GRADE_RE.test(String(d.grade ?? "")) ||
          !Number.isFinite(Number(d.score))
        ) {
          skipped++;
          continue;
        }
        const ok = await archiveScan(d, true);
        // is_public=true across the board: the request-time "private" flag is
        // not persisted in the stored JSON (rkey is generated for every scan,
        // so its presence means nothing), and private scans did not exist as
        // a feature before Nov 19 - the era these records come from
        if (ok) archived++;
        else skipped++;
      } catch {
        skipped++;
      }
    }
    return NextResponse.json({ cursor, mode, archived, skipped, count: items.length });
  } catch {
    return NextResponse.json({ error: "redis failure" }, { status: 502 });
  }
}

