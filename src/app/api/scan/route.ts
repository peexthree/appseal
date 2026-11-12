import { NextRequest, NextResponse } from "next/server";
import { runScan, normalizeInputUrl } from "@/lib/scanner";
import { newId, saveScan } from "@/lib/scanner/store";
import type { Lang, ScanResult } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    } catch {
      return NextResponse.json(
        { error: "invalid url" },
        { status: 400 },
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
    // fire and forget; polls read state from the store
    void runScan(scan);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}
