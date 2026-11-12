import type { CheckResult, Localized, ScanResult } from "./types";
import { computeScore } from "./grade";
import { saveScan, updateScan } from "./store";
import { safeFetch, truncate } from "./fetcher";
import { checkEnvExposure, checkGitExposure, checkSecretsInSource, checkBaaSOpenRead, checkSourceMaps } from "./checks/secrets";
import { checkSecurityHeaders, checkCors, checkCookies, checkTls } from "./checks/headers";
import { checkAdminExposure, checkBackups, checkDebugEndpoints } from "./checks/admin";
import { checkPlaceholder, checkRenderedErrors, checkBrokenLinks, checkMetaHealth, detectPlatform } from "./checks/liveness";

const DEMO_HOST = "http://127.0.0.1:3210";

/**
 * Detects a client-side render shell: a known SPA mount node with almost no
 * static content - the DOM the user sees is built by JS, which plain fetch
 * cannot execute (v0.3: JS-rendering engine).
 */
export function isClientRenderShell(html: string): boolean {
  const hasMount = /<div[^>]+id=["'](?:root|app|__next|__nuxt|q-app|__astro-root)["'][^>]*>/i.test(html);
  const visible = html
    .replace(/<(?:script|style|noscript|template)[\s\S]*?<\/(?:script|style|noscript|template)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/g, " ")
    .trim();
  return hasMount && visible.length < 200;
}

interface Progress {
  stage: Localized;
  progress: number;
}

async function setProgress(id: string, p: Progress) {
  await updateScan(id, { progress: p.progress, stage: p.stage });
}

export function normalizeInputUrl(input: string): { url: string; isDemo: boolean } {
  const t = input.trim();
  if (/^demo:\/\//i.test(t) || /^@demo$/i.test(t)) {
    return { url: DEMO_HOST, isDemo: true };
  }
  let u = t;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const parsed = new URL(u);
  return { url: parsed.toString(), isDemo: false };
}

/**
 * Runs a full scan for the given scan id (already saved as "queued").
 * Never throws: errors are recorded into the scan record.
 */
export async function runScan(scan: ScanResult): Promise<void> {
  try {
    await setProgress(scan.id, {
      stage: { ru: "Загружаем главную страницу…", en: "Loading the homepage…" },
      progress: 8,
    });

    const { url, isDemo } = { url: scan.targetUrl, isDemo: scan.isDemo };
    const parsed = new URL(url);
    const host = parsed.hostname;
    const origin = parsed.origin;
    const isHttp = parsed.protocol === "http:";

    const home = await safeFetch(url, { timeoutMs: 12000 });
    if (!home.ok && home.status === 0) {
      // try https fallback once
      if (isHttp === false) throw new Error("site unreachable: " + (home.error ?? home.status));
      throw new Error("site unreachable: " + (home.error ?? home.status));
    }
    if (home.status >= 400) {
      // bot-mitigation is the most common 403 from hosting firewalls - name it
      // and tell the owner the exact opt-out (openai.com lesson from report #1)
      const mitigated = (home.headers["x-vercel-mitigated"] ?? "").toLowerCase();
      if (mitigated.includes("challenge") || home.headers["x-vercel-challenge-token"]) {
        throw new Error(
          "сайт закрыт бот-челленджем Vercel (Firewall → Attack Challenge Mode): " +
            "владельцу нужно добавить bypass-правило для User-Agent AppMOT-Scanner или отключить challenge",
        );
      }
      if (home.status === 403) {
        throw new Error(
          "site responded 403 (WAF/bot protection) @ " + (home.url || url),
        );
      }
      throw new Error(`site responded ${home.status}`);
    }

    const ctx = {
      origin: new URL(home.url || url).origin,
      host,
      homeBody: home.body,
      homeHeaders: home.headers,
      isHttp: (home.url || url).startsWith("http://"),
      csr: isClientRenderShell(home.body),
      // path probes are relative to the demo base when scanning the fixture
      basePath: scan.isDemo ? new URL(url).pathname.replace(/\/+$/, "") : "",
    };

    if (ctx.csr) {
      await setProgress(scan.id, {
        stage: {
          ru: "Приложение рендерится на клиенте - часть проверок будет пропущена честно",
          en: "App is client-rendered - some checks are skipped honestly",
        },
        progress: 9,
      });
    }

    const all: { fn: () => Promise<CheckResult>; id: string }[] = [
      { fn: () => checkEnvExposure(ctx), id: "env_exposure" },
      { fn: () => checkGitExposure(ctx), id: "git_exposure" },
      { fn: () => checkSecretsInSource(ctx), id: "secrets_in_source" },
      { fn: () => checkBaaSOpenRead(ctx), id: "baas_open_read" },
      { fn: () => checkSourceMaps(ctx), id: "source_maps" },
      { fn: () => checkSecurityHeaders(ctx), id: "security_headers" },
      { fn: () => checkCors(ctx), id: "cors_wildcard" },
      { fn: () => checkCookies(ctx), id: "cookie_flags" },
      { fn: () => checkTls(ctx), id: "tls_cert" },
      { fn: () => checkAdminExposure(ctx), id: "admin_exposure" },
      { fn: () => checkBackups(ctx), id: "backup_files" },
      { fn: () => checkDebugEndpoints(ctx), id: "debug_endpoints" },
      { fn: () => checkPlaceholder(ctx), id: "placeholder_content" },
      { fn: () => checkRenderedErrors(ctx), id: "rendered_errors" },
      { fn: () => checkBrokenLinks(ctx), id: "broken_links" },
      { fn: () => checkMetaHealth(ctx), id: "meta_health" },
    ];

    // run first (cheap, home-page-only) checks sequentially to publish progress,
    // then heavy ones with a concurrency of 4
    const results: CheckResult[] = [];
    let doneCount = 0;
    const LIGHT_IDS = new Set(["placeholder_content", "rendered_errors", "meta_health"]);

    const runOne = async (fn: () => Promise<CheckResult>) => {
      try {
        const r = await fn();
        results.push(r);
      } catch (e) {
        results.push({
          id: "internal_error",
          category: "liveness",
          status: "skip",
          severity: "info",
          penalty: 0,
          durationMs: 0,
          title: { ru: "Часть проверок прервана", en: "Some checks aborted" },
          finding: {
            code: "INTERNAL",
            detail: {
              ru: "Проверка не смогла выполниться: " + truncate(e instanceof Error ? e.message : String(e), 80),
              en: "Check aborted: " + truncate(e instanceof Error ? e.message : String(e), 80),
            },
            evidence: [],
          },
        });
      }
      doneCount++;
      const p = 10 + Math.round((doneCount / all.length) * 85);
      await setProgress(scan.id, {
        stage: {
          ru: `Проверка ${doneCount} из ${all.length}…`,
          en: `Check ${doneCount} of ${all.length}…`,
        },
        progress: Math.min(95, p),
      });
    };

    // light checks first (no extra fetches beyond home)
    for (const item of all.filter((a) => LIGHT_IDS.has(a.id))) {
      await runOne(item.fn);
    }

    // heavy checks, concurrency 4
    const heavy = all.filter((a) => !LIGHT_IDS.has(a.id));
    const queue = [...heavy];
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        await runOne(item.fn);
      }
    });
    await Promise.all(workers);

    const platform = detectPlatform(home.body, host);
    const { score, grade } = computeScore(results);

    results.sort((a, b) => {
      const cat: Record<string, number> = { secrets: 0, headers: 1, admin: 2, liveness: 3 };
      if (cat[a.category] !== cat[b.category]) return cat[a.category] - cat[b.category];
      const sevRank = (r: CheckResult) => (r.status === "fail" ? 0 : r.status === "warn" ? 1 : 2);
      if (sevRank(a) !== sevRank(b)) return sevRank(a) - sevRank(b);
      // heavier penalty first within the same category+status group
      return b.penalty - a.penalty;
    });

    await updateScan(scan.id, {
      status: "done",
      progress: 100,
      stage: { ru: "Готово", en: "Done" },
      finishedAt: new Date().toISOString(),
      score,
      grade,
      results,
      platform: platform ?? undefined,
      host: scan.isDemo ? "demo-app" : host,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateScan(scan.id, {
      status: "error",
      finishedAt: new Date().toISOString(),
      progress: 100,
      stage: { ru: "Ошибка", en: "Error" },
      error: {
        ru: "Не удалось просканировать: " + truncate(msg, 140),
        en: "Scan failed: " + truncate(msg, 140),
      },
    });
  }
}
