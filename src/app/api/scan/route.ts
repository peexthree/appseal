import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runScan, normalizeInputUrl } from "@/lib/scanner";
import { newId, newReportKey, saveScan, serializeScan, pushRegistryEntry } from "@/lib/scanner/store";
import { assertPublicTarget } from "@/lib/scanner/guard";
import { bumpDailyQuota, hasActivePass, hashIp } from "@/lib/passes";
import type { Lang, ScanResult } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// scan takes 15-40s; keep the function alive for the background work
export const maxDuration = 60;

// free tier promised in the pricing table: 1 full scan per day per IP;
// an active Launch Pass on the target host bypasses it
const FREE_DAILY_LIMIT = 1;

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

    // free quota (demo target excluded - it is the marketing funnel);
    // a live Launch Pass on the target host removes the limit
    if (!norm.isDemo) {
      const ip =
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0] ??
        "unknown";
      const targetHost = new URL(norm.url).hostname;
      const pass = await hasActivePass(targetHost);
      if (!pass) {
        const { allowed } = await bumpDailyQuota(hashIp(ip), FREE_DAILY_LIMIT);
        if (!allowed) {
          return NextResponse.json(
            { error: "quota_exceeded", upsell: "launch-pass" },
            { status: 429 },
          );
        }
      }
    }

    // the built-in demo target is served by this app itself (works in prod
    // and locally without the standalone mini-service)
    const fwdHost = req.headers.get("host") ?? new URL(req.url).host;
    const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? new URL(req.url).protocol.replace(":", "");
    const demoTargetUrl = `${fwdProto}://${fwdHost}/api/demo-target`;

    const id = newId();
    const rkey = newReportKey();
    const scan: ScanResult = {
      id,
      inputUrl: raw,
      targetUrl: norm.isDemo ? demoTargetUrl : norm.url,
      host: norm.isDemo ? "demo-app" : new URL(norm.url).hostname,
      isDemo: norm.isDemo,
      lang: body.lang === "en" ? "en" : "ru",
      startedAt: new Date().toISOString(),
      finishedAt: "",
      status: "running",
      progress: 2,
      stage: { ru: "Подключаемся…", en: "Connecting…" },
      score: 0,
      grade: "E",
      results: [],
      rkey,
    };

    await saveScan(id, serializeScan(scan));
    // run the scan after the response is sent; on Vercel this keeps the
    // function alive (waitUntil) within maxDuration, locally it just works
    after(async () => {
      // runScan never throws: the final record lands in the store; its return
      // value feeds the public registry. Demo scans excluded; the registry is
      // a curated showcase - only A/A+ hosts make it in.
      const fin = await runScan(scan);
      if (fin && !scan.isDemo && (fin.grade === "A+" || fin.grade === "A")) {
        await pushRegistryEntry({
          host: fin.host,
          grade: fin.grade,
          score: fin.score,
          ts: Date.now(),
          id: scan.id,
          desc: fin.pageTitle,
        });
      }
    });
    // rkey goes only to the initiator: bare id grants the public view, the
    // key unlocks the full report (results, PDF) for this browser session
    return NextResponse.json({ id, rkey });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}
