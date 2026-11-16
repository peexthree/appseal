import { NextRequest, NextResponse } from "next/server";
import { getLatestHostEntry } from "@/lib/scanner/store";
import { canonicalHost } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public verification API: the live grade of a host, straight from the
 * registry (same source as the host-bound badge). Aggregate-only - no scan
 * findings, ever. Meant for third-party dashboards, bots and articles.
 *
 *   GET /api/verify?host=example.com
 *   -> { host, grade, score, checkedAt, profile, badge }
 *   404 { error: "not_scanned" } when the host never went through the registry
 */
export async function GET(req: NextRequest) {
  const hostParam = (req.nextUrl.searchParams.get("host") ?? "").trim().toLowerCase();
  if (!hostParam || hostParam.length > 253 || !hostParam.match(/^[a-z0-9.-]+\.[a-z]{2,}$/)) {
    return NextResponse.json({ error: "invalid_host" }, { status: 400 });
  }
  const host = canonicalHost(hostParam);
  const entry = await getLatestHostEntry(host);
  if (!entry) {
    return NextResponse.json(
      { error: "not_scanned", host, hint: "https://appseal.online - запустите бесплатный скан" },
      { status: 404, headers: { "cache-control": "public, max-age=300" } },
    );
  }
  return NextResponse.json(
    {
      host: entry.host,
      grade: entry.grade,
      score: entry.score,
      checkedAt: new Date(entry.ts).toISOString(),
      profile: `${req.nextUrl.origin}/verified/${encodeURIComponent(entry.host)}`,
      badge: `${req.nextUrl.origin}/api/badge?host=${encodeURIComponent(entry.host)}`,
      seal: "AppSeal Security Verified",
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
