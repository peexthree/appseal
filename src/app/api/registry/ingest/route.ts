import { NextRequest, NextResponse } from "next/server";
import { pushRegistryEntry } from "@/lib/scanner/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registry ingest for benchmark runs (issue #3 GTM): the local benchmark
 * runner scans hundreds of publicly posted AI-built apps and pushes only the
 * ones that earned grade A/A+. Everything below A stays anonymous in the
 * aggregate stats - a host is listed publicly either because the scan was
 * initiated by its owner (regular /api/scan flow) or because it passed the
 * top bar. Lowering the bar here would turn the catalog into a wall of shame.
 */

const PUBLISH_GRADES = new Set(["A+", "A"]);
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ID_RE = /^[a-z0-9-]{6,40}$/;
const MAX_BATCH = 100;
const DAY_MS = 86_400_000;

interface IngestEntry {
  host?: unknown;
  grade?: unknown;
  score?: unknown;
  ts?: unknown;
  id?: unknown;
}

export async function POST(req: NextRequest) {
  const key = process.env.REGISTRY_INGEST_KEY ?? "";
  if (!key) {
    return NextResponse.json({ error: "ingest not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${key}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { entries?: IngestEntry[] };
  try {
    body = (await req.json()) as { entries?: IngestEntry[] };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const list = Array.isArray(body.entries) ? body.entries.slice(0, MAX_BATCH) : [];
  if (!list.length) {
    return NextResponse.json({ error: "entries required" }, { status: 400 });
  }

  const now = Date.now();
  let accepted = 0;
  let rejected = 0;
  const seenHosts = new Set<string>();

  for (const e of list) {
    const host =
      typeof e.host === "string" ? e.host.toLowerCase().replace(/^www\./, "") : "";
    const grade = typeof e.grade === "string" ? e.grade : "";
    const score = typeof e.score === "number" ? e.score : NaN;
    const ts = typeof e.ts === "number" ? e.ts : NaN;
    const id = typeof e.id === "string" ? e.id : "";

    // one entry per host per batch; window covers a long run, blocks garbage
    const ok =
      HOST_RE.test(host) &&
      PUBLISH_GRADES.has(grade) &&
      Number.isInteger(score) &&
      score >= 0 &&
      score <= 100 &&
      Number.isFinite(ts) &&
      ts > now - 14 * DAY_MS &&
      ts < now + 5 * 60_000 &&
      ID_RE.test(id) &&
      !seenHosts.has(host);
    if (!ok) {
      rejected += 1;
      continue;
    }
    seenHosts.add(host);
    await pushRegistryEntry({ host, grade, score, ts, id });
    accepted += 1;
  }

  return NextResponse.json({ ok: true, accepted, rejected });
}
