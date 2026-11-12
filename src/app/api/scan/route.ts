import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runScan, normalizeInputUrl } from "@/lib/scanner";
import { newId, saveScan } from "@/lib/scanner/store";
import { assertPublicTarget } from "@/lib/scanner/guard";
import type { Lang, ScanResult } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// scan takes 15-40s; keep the function alive for the background work
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; lang?: Lang };
    const raw = (body.url ?? "").trim();
    if (!raw) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    let norm;
    try {
      norm = normalizeInputUrl(raw);
      if (!norm.isDemo) {
        // SSRF guard: scanner only talks to public hosts (demo fixture is first-party)
        await assertPublicTarget(new URL(norm.url).hostname);
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : "invalid url";
      const isGuard = reason.includes("public") || reason.includes("resolve");
      return NextResponse.json(
        { error: isGuard ? reason : "invalid url" },
        { status: isGuard ? 403 : 400 },
      );
    }

    const id = newId();
    const scan: ScanResult = {
      id,
      inputUrl: raw,
      targetUrl: norm.url,
      host: norm.isDemo ? "demo-app" : new URL(norm.url).hostname,
      isDemo: norm.isDemo,
      lang: body.lang === "en" ? "en" : "ru",
      startedAt: new Date().toISOString(),
      finishedAt: "",
      status: "running",
      progress: 2,
      stage: { ru: "Подключаемся…", en: "Connecting…" },
      score: 0,
      grade: "D",
      results: [],
    };

    await saveScan(scan);
    // run the scan after the response is sent; on Vercel this keeps the
    // function alive (waitUntil) within maxDuration, locally it just works
    after(async () => {
      await runScan(scan);
    });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}
