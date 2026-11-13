import { NextRequest, NextResponse } from "next/server";
import { getScan, publicView, updateScan } from "@/lib/scanner/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// a scan should finish well within maxDuration; if it is still "running"
// after this long, the worker died - report an honest error to the client
const STALE_MS = 3 * 60 * 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const scan = await getScan(id);
  if (!scan) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (scan.status === "running") {
    const age = Date.now() - new Date(scan.startedAt).getTime();
    if (age > STALE_MS) {
      const dead = await updateScan(id, {
        status: "error",
        finishedAt: new Date().toISOString(),
        progress: 100,
        stage: { ru: "Ошибка", en: "Error" },
        error: {
          ru: "Скан не завершился вовремя - попробуйте повторить",
          en: "Scan did not finish in time - please retry",
        },
      });
      return NextResponse.json({ ...(dead ?? scan), rkey: undefined }, {
        headers: { "cache-control": "no-store" },
      });
    }
  }

  // done scans carry the findings: full record only for the initiator who
  // holds the report key, everyone else gets the public verification view
  if (scan.status === "done") {
    if (scan.rkey && scan.rkey === key) {
      return NextResponse.json({ ...scan, rkey: undefined }, {
        headers: { "cache-control": "no-store" },
      });
    }
    return NextResponse.json(publicView(scan), {
      headers: { "cache-control": "no-store" },
    });
  }

  return NextResponse.json({ ...scan, rkey: undefined }, {
    headers: { "cache-control": "no-store" },
  });
}
