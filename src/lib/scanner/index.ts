import type { CheckResult, Localized, ScanResult } from "./types";
import { computeScore } from "./grade";
import { saveScan, updateScan } from "./store";
import { isClientRenderShell, safeFetch, truncate } from "./fetcher";
import { renderPage, shouldRender } from "./render";
import {
  checkEnvExposure,
  checkEnvVariants,
  checkGitExposure,
  checkVcsLeaks,
  checkSecretsInSource,
  checkFirebaseOpenRead,
  checkSupabaseOpenRead,
  checkSourceMaps,
  checkClientEnvLeak,
  checkDockerK8sExposure,
  checkManifestExposure,
  checkSecurityTxt,
} from "./checks/secrets";
import {
  checkSecurityHeaders,
  checkIsolationHeaders,
  checkLeakyHeaders,
  checkCors,
  checkCookies,
  checkTls,
  checkHttpsRedirects,
  checkTransportHygiene,
} from "./checks/headers";
import {
  checkSoft404,
  checkAdminExposure,
  checkBackups,
  checkDebugEndpoints,
  checkDebugTargets,
  checkFrameworkErrors,
  checkSwaggerOpen,
  checkGraphqlOpen,
  checkWpEnum,
  checkDirectoryListing,
  checkCorsPreflightMethods,
  checkRateLimitProtection,
} from "./checks/admin";
import {
  checkPlaceholder,
  checkDefaultPage,
  checkRenderedErrors,
  checkTinyPage,
  checkBrokenLinks,
  checkMetaHealth,
  checkFavicon,
  checkOpenGraphHealth,
  checkMixedContentDom,
  checkScriptHygiene,
  checkImgAlt,
  detectPlatform,
  detectTechPassport,
} from "./checks/liveness";

const DEMO_HOST = "http://127.0.0.1:3210";

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
 * Runs a full ~100-check scan for the given scan id (already saved as "queued").
 * Each macro-check returns a group of granular results; never throws: errors
 * are recorded into the scan record.
 * Returns the final outcome on success (for the registry feed) or null.
 */
export async function runScan(scan: ScanResult): Promise<{ host: string; grade: string; score: number } | null> {
  try {
    await setProgress(scan.id, {
      stage: { ru: "Загружаем главную страницу…", en: "Loading the homepage…" },
      progress: 6,
    });

    const { url, isDemo } = { url: scan.targetUrl, isDemo: scan.isDemo };
    const parsed = new URL(url);
    const host = parsed.hostname;
    const origin = parsed.origin;
    const isHttp = parsed.protocol === "http:";

    // Check robots.txt opt-out for public targets
    if (!isDemo) {
      try {
        const rob = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 4000, maxBody: 32 * 1024 });
        if (rob.ok && rob.status === 200 && rob.body) {
          const uaBlocks = rob.body.split(/User-agent:\s*/i);
          for (const block of uaBlocks) {
            const lines = block.split("\n").map((l) => l.trim());
            const agent = lines[0]?.toLowerCase() ?? "";
            if (agent.includes("appseal-scanner") || agent.includes("appseal")) {
              const hasDisallowAll = lines.some((l) => /^disallow:\s*\/\s*$/i.test(l));
              if (hasDisallowAll) {
                throw new Error("сайт запретил сканирование через robots.txt (User-agent: AppSeal-Scanner; Disallow: /)");
              }
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("robots.txt")) throw e;
      }
    }

    const home = await safeFetch(url, { timeoutMs: 12000 });
    if (!home.ok && home.status === 0) {
      if (isHttp === false) throw new Error("site unreachable: " + (home.error ?? home.status));
      throw new Error("site unreachable: " + (home.error ?? home.status));
    }
    if (home.status >= 400) {
      const mitigated = (home.headers["x-vercel-mitigated"] ?? "").toLowerCase();
      if (mitigated.includes("challenge") || home.headers["x-vercel-challenge-token"]) {
        throw new Error(
          "сайт закрыт бот-челленджем Vercel (Firewall → Attack Challenge Mode): " +
            "владельцу нужно добавить bypass-правило для User-Agent AppSeal-Scanner или отключить challenge",
        );
      }
      if (home.status === 403) {
        throw new Error("site responded 403 (WAF/bot protection) @ " + (home.url || url));
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
      basePath: scan.isDemo ? new URL(url).pathname.replace(/\/+$/, "") : "",
      finalUrl: home.url,
    };

    if (shouldRender(ctx.csr, scan.isDemo)) {
      await setProgress(scan.id, {
        stage: {
          ru: "Приложение рендерится на клиенте - загружаем через браузер...",
          en: "App is client-rendered - loading it in a browser...",
        },
        progress: 8,
      });
      const rendered = await renderPage(url);
      if (rendered) {
        ctx.homeBody = rendered.html;
        ctx.csr = false;
      }
    }

    if (ctx.csr) {
      await setProgress(scan.id, {
        stage: {
          ru: "Приложение рендерится на клиенте - часть проверок будет пропущена честно",
          en: "App is client-rendered - some checks are skipped honestly",
        },
        progress: 8,
      });
    }

    // 43 macro-checks, each returning a group of granular results (~100 total)
    const all: { fn: () => Promise<CheckResult[]>; id: string }[] = [
      // 1. Secrets & leaks
      { fn: () => checkEnvExposure(ctx), id: "env_exposure" },
      { fn: () => checkEnvVariants(ctx), id: "env_variants" },
      { fn: () => checkGitExposure(ctx), id: "git_exposure" },
      { fn: () => checkVcsLeaks(ctx), id: "vcs_leaks" },
      { fn: () => checkSecretsInSource(ctx), id: "secrets_in_source" },
      { fn: () => checkClientEnvLeak(ctx), id: "client_env_leak" },
      { fn: () => checkFirebaseOpenRead(ctx), id: "firebase_open_read" },
      { fn: () => checkSupabaseOpenRead(ctx), id: "supabase_open_read" },
      { fn: () => checkSourceMaps(ctx), id: "source_maps" },
      { fn: () => checkDockerK8sExposure(ctx), id: "docker_k8s_exposure" },
      { fn: () => checkManifestExposure(ctx), id: "manifest_exposure" },
      { fn: () => checkSecurityTxt(ctx), id: "security_txt" },

      // 2. Headers & TLS
      { fn: () => checkSecurityHeaders(ctx), id: "security_headers" },
      { fn: () => checkIsolationHeaders(ctx), id: "isolation_headers" },
      { fn: () => checkLeakyHeaders(ctx), id: "leaky_headers" },
      { fn: () => checkCors(ctx), id: "cors_wildcard" },
      { fn: () => checkCookies(ctx), id: "cookie_flags" },
      { fn: () => checkTls(ctx), id: "tls_cert" },
      { fn: () => checkHttpsRedirects(ctx), id: "https_redirects" },
      { fn: () => checkTransportHygiene(ctx), id: "transport_hygiene" },

      // 3. Admin & auth
      { fn: () => checkSoft404(ctx), id: "soft404_routing" },
      { fn: () => checkAdminExposure(ctx), id: "admin_exposure" },
      { fn: () => checkBackups(ctx), id: "backup_files" },
      { fn: () => checkDebugEndpoints(ctx), id: "debug_endpoints" },
      { fn: () => checkDebugTargets(ctx), id: "debug_targets" },
      { fn: () => checkFrameworkErrors(ctx), id: "framework_errors" },
      { fn: () => checkSwaggerOpen(ctx), id: "swagger_open" },
      { fn: () => checkGraphqlOpen(ctx), id: "graphql_ui_open" },
      { fn: () => checkWpEnum(ctx), id: "wp_enum" },
      { fn: () => checkDirectoryListing(ctx), id: "directory_listing" },
      { fn: () => checkCorsPreflightMethods(ctx), id: "cors_preflight_methods" },
      { fn: () => checkRateLimitProtection(ctx), id: "auth_rate_limit" },

      // 4. Liveness & content
      { fn: () => checkPlaceholder(ctx), id: "placeholder_content" },
      { fn: () => checkDefaultPage(ctx), id: "default_page" },
      { fn: () => checkRenderedErrors(ctx), id: "rendered_errors" },
      { fn: () => checkTinyPage(ctx), id: "tiny_page" },
      { fn: () => checkBrokenLinks(ctx), id: "broken_links" },
      { fn: () => checkMetaHealth(ctx), id: "meta_health" },
      { fn: () => checkFavicon(ctx), id: "favicon" },
      { fn: () => checkOpenGraphHealth(ctx), id: "open_graph_health" },
      { fn: () => checkMixedContentDom(ctx), id: "mixed_content_dom" },
      { fn: () => checkScriptHygiene(ctx), id: "script_hygiene" },
      { fn: () => checkImgAlt(ctx), id: "img_alt" },
    ];

    const results: CheckResult[] = [];
    let doneCount = 0;
    const LIGHT_IDS = new Set([
      "security_headers",
      "isolation_headers",
      "leaky_headers",
      "cookie_flags",
      "placeholder_content",
      "rendered_errors",
      "tiny_page",
      "default_page",
      "meta_health",
      "open_graph_health",
      "mixed_content_dom",
      "script_hygiene",
      "img_alt",
      "framework_errors",
    ]);

    const runOne = async (fn: () => Promise<CheckResult[]>) => {
      try {
        const group = await fn();
        results.push(...group);
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

    // run light checks first
    for (const item of all.filter((a) => LIGHT_IDS.has(a.id))) {
      await runOne(item.fn);
    }

    // run heavy probes with concurrency 4
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
    const techPassport = detectTechPassport(home.body, home.headers, host, home.bodyBytes, home.durationMs);
    const { score, grade } = computeScore(results);

    results.sort((a, b) => {
      const cat: Record<string, number> = { secrets: 0, headers: 1, admin: 2, liveness: 3 };
      if (cat[a.category] !== cat[b.category]) return cat[a.category] - cat[b.category];
      const sevRank = (r: CheckResult) => (r.status === "fail" ? 0 : r.status === "warn" ? 1 : 2);
      if (sevRank(a) !== sevRank(b)) return sevRank(a) - sevRank(b);
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
      techPassport,
      host: scan.isDemo ? "demo-app" : host,
    });
    return { host: scan.isDemo ? "demo-app" : host, grade, score };
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
    return null;
  }
}
