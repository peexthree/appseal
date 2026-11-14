import { NextResponse } from "next/server";
import { runScan, normalizeInputUrl } from "@/lib/scanner";
import { assertPublicTarget } from "@/lib/scanner/guard";
import {
  newId,
  newReportKey,
  saveScan,
  serializeScan,
  pushRegistryEntry,
  redisConfig,
  redis,
} from "@/lib/scanner/store";
import type { Lang, ScanResult } from "@/lib/scanner/types";

export const runtime = "nodejs";
// one scan takes 15-40s; the tick does a full scan inline
export const maxDuration = 60;

/**
 * Living-registry heartbeat: each call scans ONE freshly harvested AI-built
 * app and feeds the result into the public registry (any grade), so the
 * catalog visibly updates around the clock with new hosts - not rescans of
 * the old panel. No user interaction, no local machine involved.
 *
 * Flow per tick:
 *  1. rate-lock (public endpoint - a stranger calling it just gets a no-op);
 *  2. if the queue is empty, harvest fresh Show HN / GitHub targets (hourly
 *     self-throttled), dedupe hosts against the known set, enqueue newcomers;
 *  3. pop one URL, run the scanner inline, publish the result to the registry;
 *  4. bump the 24h counter shown on /registry.
 *
 * Driven by a free scheduler hitting this URL every 30 minutes
 * (.github/workflows/pipeline-tick.yml).
 */

const QUEUE = "appmot:pipeline:queue";
const KNOWN = "appmot:pipeline:known";
const LOCK = "appmot:pipeline:lock";
const HARVEST_LOCK = "appmot:pipeline:harvest-lock";
const COUNTER = "appmot:pipeline:scans24h";

const MIN_INTERVAL_S = 1200; // one auto scan per 20 min at most
const HARVEST_THROTTLE_S = 3600; // fresh-target refresh at most once an hour

// fresh-target sources: only first pages - recent posts are what we want
const HN_QUERIES = ["v0", "bolt.new", "lovable", "vibe coding", "ai-generated app", "built with ai"];
const GH_QUERIES = ["built with v0", "built with lovable", "built with bolt.new", "vibe coding app"];

// allowlist: outbound harvest requests may only go to these two API hosts
const API_HOSTS = new Set(["hn.algolia.com", "api.github.com"]);

const BLOCKED_EXACT = new Set([
  "github.com", "gist.github.com", "gitlab.com", "x.com", "twitter.com", "t.co",
  "youtube.com", "youtu.be", "reddit.com", "redd.it", "medium.com", "dev.to",
  "substack.com", "news.ycombinator.com", "hn.algolia.com", "producthunt.com",
  "www.producthunt.com", "docs.google.com", "drive.google.com", "forms.gle",
  "notion.so", "notion.site", "figma.com", "canva.com", "discord.gg",
  "discord.com", "t.me", "telegram.me", "linkedin.com", "facebook.com",
  "instagram.com", "tiktok.com", "threads.net", "bsky.app", "codepen.io",
  "jsfiddle.net", "codesandbox.io", "stackblitz.com", "replit.com", "v0.dev",
  "chatgpt.com", "claude.ai", "bolt.new", "lovable.dev", "vercel.com",
  "netlify.com", "app.netlify.com", "render.com", "railway.app",
  "apps.apple.com", "itunes.apple.com", "play.google.com", "apps.shopify.com",
  "codeberg.org", "sourceforge.net", "bitbucket.org", "npmjs.com", "pypi.org",
  "huggingface.co", "hf.co", "kaggle.com", "arxiv.org",
]);

const DEPLOY_SUFFIXES = [
  ".vercel.app", ".netlify.app", ".pages.dev", ".workers.dev", ".lovable.app",
  ".replit.app", ".replit.dev", ".onrender.com", ".up.railway.app", ".fly.dev",
  ".glitch.me", ".web.app", ".firebaseapp.com", ".amplifyapp.com",
  ".azurestaticapps.net", ".github.io", ".gitlab.io", ".deno.dev",
];

const AI_MARKERS = ["v0", "bolt", "lovable", "vibe", "claude", "gpt", "cursor",
  "windsurf", "copilot", " ai", "ai-", "ai ", "replit agent"];

interface FetchJson {
  hits?: { url?: string; title?: string }[];
  items?: { homepage?: string; description?: string; full_name?: string }[];
}

async function fetchApi(url: string, timeoutMs: number): Promise<FetchJson | null> {
  const host = new URL(url).hostname;
  if (!API_HOSTS.has(host)) throw new Error(`harvest host not allowed: ${host}`);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "AppSeal-Harvest/0.2 (+https://appseal.online/bot)", accept: "application/json" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as FetchJson;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isDeployHost(u: string): boolean {
  const h = hostOf(u);
  return DEPLOY_SUFFIXES.some((s) => h.endsWith(s));
}

function looksAi(text: string): boolean {
  const t = text.toLowerCase();
  return AI_MARKERS.some((m) => t.includes(m));
}

/**
 * Pull the newest public posts, keep only plausible deployed AI apps and
 * enqueue hosts never seen before. Returns how many URLs were enqueued.
 */
async function harvestFresh(cfg: NonNullable<ReturnType<typeof redisConfig>>): Promise<number> {
  const got = await redis(cfg, ["SET", HARVEST_LOCK, "1", "EX", String(HARVEST_THROTTLE_S), "NX"]);
  if (got !== "OK") return 0;

  let added = 0;
  const cand: { url: string; title: string }[] = [];
  for (const q of HN_QUERIES) {
    const d = await fetchApi(
      "https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=50&query=" +
        encodeURIComponent(q),
      15000,
    );
    for (const hit of d?.hits ?? []) {
      const u = (hit.url ?? "").trim();
      if (u.startsWith("http") && !BLOCKED_EXACT.has(hostOf(u))) {
        cand.push({ url: u.split("#")[0], title: hit.title ?? "" });
      }
    }
  }
  for (const q of GH_QUERIES) {
    const d = await fetchApi(
      "https://api.github.com/search/repositories?per_page=50&sort=updated&q=" +
        encodeURIComponent(q),
      15000,
    );
    for (const repo of d?.items ?? []) {
      const u = (repo.homepage ?? "").trim();
      if (u.startsWith("http") && !BLOCKED_EXACT.has(hostOf(u))) {
        cand.push({ url: u.split("#")[0], title: `${repo.description ?? ""} ${repo.full_name ?? ""}` });
      }
    }
  }

  for (const c of cand) {
    const host = hostOf(c.url);
    if (!host || !host.includes(".")) continue;
    if (!isDeployHost(c.url) && !looksAi(c.title)) continue;
    const isNew = await redis(cfg, ["SADD", KNOWN, host]);
    if (Number(isNew) === 1) {
      await redis(cfg, ["ZADD", QUEUE, "0", c.url]);
      added += 1;
    }
  }
  return added;
}

export async function GET() {
  const cfg = redisConfig();
  if (!cfg) {
    return NextResponse.json({ error: "redis backend required" }, { status: 503 });
  }

  // public endpoint: the lock is the throttle - extra calls are no-ops
  const lock = await redis(cfg, ["SET", LOCK, "1", "EX", String(MIN_INTERVAL_S), "NX"]);
  if (lock !== "OK") {
    return NextResponse.json({ skipped: true, reason: "rate-locked" });
  }

  try {
    let queueSize = Number(await redis(cfg, ["ZCARD", QUEUE]));
    let added = 0;
    if (!queueSize) {
      added = await harvestFresh(cfg);
      queueSize = Number(await redis(cfg, ["ZCARD", QUEUE]));
    }
    if (!queueSize) {
      return NextResponse.json({ skipped: true, reason: "queue-empty", harvested: added });
    }

    // newest targets first: score 0 on enqueue, popped one at a time
    const popped = (await redis(cfg, ["ZPOPMIN", QUEUE])) as string[];
    const url = popped?.[0] ?? "";
    if (!url) {
      return NextResponse.json({ skipped: true, reason: "queue-empty", harvested: added });
    }

    const norm = normalizeInputUrl(url);
    await assertPublicTarget(new URL(norm.url).hostname);
    const host = new URL(norm.url).hostname;
    const id = newId();
    const scan: ScanResult = {
      id,
      inputUrl: url,
      targetUrl: norm.url,
      host,
      isDemo: false,
      lang: "ru" as Lang,
      startedAt: new Date().toISOString(),
      finishedAt: "",
      status: "running",
      progress: 2,
      stage: { ru: "Автоскан…", en: "Auto scan…" },
      score: 0,
      grade: "E",
      results: [],
      rkey: newReportKey(),
    };
    await saveScan(id, serializeScan(scan));
    const fin = await runScan(scan);

    // runScan returns the outcome on success or null when the scan failed
    // (the error is already recorded in the store)
    const status = fin ? "done" : "error";
    const grade = fin?.grade ?? "E";
    const finalScore = fin?.score ?? 0;
    if (fin) {
      await pushRegistryEntry({
        host: fin.host,
        grade: fin.grade,
        score: fin.score,
        ts: Date.now(),
        id,
        desc: fin.pageDesc ?? fin.pageTitle,
      });
    }
    if (fin) {
      await redis(cfg, ["INCR", COUNTER]);
      await redis(cfg, ["EXPIRE", COUNTER, "86400", "NX"]);
    }

    return NextResponse.json({
      host: fin?.host ?? host,
      grade,
      score: finalScore,
      status,
      harvested: added,
      queue: Number(await redis(cfg, ["ZCARD", QUEUE])),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "tick failed" },
      { status: 500 },
    );
  }
}
