import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runScan, normalizeInputUrl } from "@/lib/scanner";
import { newId, newReportKey, saveScan, serializeScan, pushRegistryEntry, redisConfig, redis, sweepExpiredScans } from "@/lib/scanner/store";
import { assertPublicTarget } from "@/lib/scanner/guard";
import { bumpDailyQuota, hasActivePass, hasPassAccess, hashIp } from "@/lib/passes";
import { lookupApiToken, tokenFromHeaders } from "@/lib/api-tokens";
import { archiveScan } from "@/lib/db/index";
import { getClientIp, secretsMatch } from "@/lib/sec";
import { sendTelegramAlert } from "@/lib/telegram";
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
    const body = (await req.json()) as { url?: string; lang?: Lang; adminKey?: string; private?: boolean };
    const raw = (body.url ?? "").trim();
    if (!raw) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    let norm;
    try {
      norm = normalizeInputUrl(raw);
      // demo mode runs ONLY against the built-in fixture served by this app:
      // normalizeInputUrl accepts any demo://host shape, but the scanner must
      // never be pointed at arbitrary "demo" targets
      if (norm.isDemo && !/^(demo:\/\/app|@demo)$/i.test(raw)) {
        return NextResponse.json({ error: "invalid url" }, { status: 400 });
      }
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
    // a live Launch Pass on the target host removes the limit;
    // the owner's admin key removes it too (set ADMIN_SCAN_KEY in env)
    const adminBypass = secretsMatch((body.adminKey ?? "").trim(), (process.env.ADMIN_SCAN_KEY ?? "").trim());
    // Pro Pass API token (Bearer as_... / x-api-token) lifts the daily quota
    // exactly like the admin key; the scanlock concurrency limit below stays
    // for everyone - it protects the engine, not the funnel
    const token = tokenFromHeaders(req.headers);
    const apiTok = token ? await lookupApiToken(token) : null;
    const ip = getClientIp(req.headers);

    // private scan: stays out of the public registry/catalog entirely, but
    // needs a reason to exist - admin key, API token, or a live pass on the
    // scanned host (demo targets can never be private)
    const isPrivate = body.private === true && !norm.isDemo;
    if (isPrivate) {
      const targetHost = new URL(norm.url).hostname;
      const allowed = adminBypass || Boolean(apiTok) || (await hasPassAccess(targetHost));
      if (!allowed) {
        return NextResponse.json(
          { error: "private_requires_pass", upsell: "launch-pass" },
          { status: 402 },
        );
      }
    }

    if (!norm.isDemo && !adminBypass && !apiTok) {
      // getClientIp trusts cf-connecting-ip only when the connection actually
      // arrives from a Cloudflare edge, and never takes a client-supplied
      // X-Forwarded-For entry (last proxy-appended hop only) - a forged
      // header cannot forge the quota identity
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

    // per-IP concurrency limit: at most one in-flight scan per IP. A Redis
    // SET NX with a 5-minute TTL is the lock (the TTL bounds a crashed
    // function's lock); the DEL runs when the background scan FINISHES -
    // inside after() - so the lock really covers the 15-40s engine run, not
    // just the submission. No Redis configured or an Upstash hiccup -> the
    // limit is skipped, same degrade-as-the-store rule.
    let releaseScanLock: (() => void) | null = null;
    if (!norm.isDemo && !adminBypass) {
      const lockCfg = redisConfig();
      if (lockCfg) {
        const lockKey = `scanlock:${hashIp(ip)}`;
        const got = await redis(lockCfg, ["SET", lockKey, "1", "EX", "300", "NX"]).catch(
          () => "redis-error",
        );
        if (got === null) {
          // the key existed: this IP already has a scan in flight
          return NextResponse.json(
            { error: "scan_in_progress" },
            { status: 429 },
          );
        }
        if (got === "OK") {
          let released = false;
          releaseScanLock = () => {
            if (released) return;
            released = true;
            void redis(lockCfg, ["DEL", lockKey]).catch(() => undefined);
          };
        }
      }
    }

    // the built-in demo target is served by this app itself (works in prod
    // and locally without the standalone mini-service)
    const fwdHost = req.headers.get("host") ?? new URL(req.url).host;
    const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? new URL(req.url).protocol.replace(":", "");
    const demoTargetUrl = `${fwdProto}://${fwdHost}/api/demo-target`;

    try {
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
        try {
          // 🔔 Notify owner: someone started a scan. Fired (not awaited) inside
          // after(): the callback keeps the function alive, and the Bot API call
          // always settles within its own 10s socket timeout - far shorter than
          // the scan itself - without delaying runScan's 60s maxDuration budget.
          void sendTelegramAlert(
            `🔍 Новая проверка сайта\n` +
            `🌐 URL: ${norm.isDemo ? "demo" : norm.url}\n` +
            `🕐 ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}\n` +
            (ip !== "unknown" ? `📡 IP: ${ip}` : "")
          );

          // runScan never throws: the final record lands in the store; its return
          // value feeds the public registry. Demo scans excluded, private scans
          // too - a private scan never reaches the registry/catalog/stats (all
          // of them live inside pushRegistryEntry), while PDF/badge gating is
          // unchanged: the report key still unlocks the full PDF as usual.
          const fin = await runScan(scan);
          if (fin && !scan.isDemo && !isPrivate) {
            await pushRegistryEntry({
              host: fin.host,
              grade: fin.grade,
              score: fin.score,
              ts: Date.now(),
              id: scan.id,
              desc: fin.pageDesc ?? fin.pageTitle,
              platform: fin.platform,
            });
          }
          // durable archive for every finished scan (private ones stored with
          // is_public=false); best-effort void - an archive hiccup never breaks
          // the scan response. runScan returns only the final verdict fields, so
          // the archive record is the in-flight scan (id/inputs) + fin overlay.
          if (fin) {
            void archiveScan(
              { ...scan, ...fin, status: "done", finishedAt: new Date().toISOString() },
              !isPrivate,
            );
          }
          // TTL sweep rides along the scan pipeline, throttled inside
          void sweepExpiredScans();
        } finally {
          // the scan is done (or the function died): release the per-IP
          // in-flight lock here, not at response time
          releaseScanLock?.();
        }
      });
      // rkey goes only to the initiator: bare id grants the public view, the
      // key unlocks the full report (results, PDF) for this browser session
      return NextResponse.json({ id, rkey });
    } catch (e) {
      // the submission itself failed - nothing is in flight, free the IP now
      releaseScanLock?.();
      throw e;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}
