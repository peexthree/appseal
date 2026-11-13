/**
 * One-off backfill: adds short descriptions (from harvest_meta.json titles)
 * to existing A/A+ entries of the production registry (Upstash list
 * appmot:registry). Preserves entry order and fields; only fills empty desc.
 *
 * Usage:
 *   node --env-file=D:\BIR\.env scripts/backfill_registry_desc.mjs --dry
 *   node --env-file=D:\BIR\.env scripts/backfill_registry_desc.mjs --push
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const push = args.includes("--push");

const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim().replace(/^"|"$/g, "");
const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim().replace(/^"|"$/g, "");
if (!url || !token) {
  console.error("missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env");
  process.exit(1);
}

const KEY = "appmot:registry";
const meta = JSON.parse(readFileSync(new URL("./benchmark_data/harvest_meta.json", import.meta.url), "utf-8"));

/** clean a scraped title into a showcase description */
function cleanTitle(raw) {
  let t = String(raw ?? "");
  t = t.replace(/^show hn[:\s-]*/i, "").trim();
  t = t.replace(/[–—]/g, "-");
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, 120);
}

function metaTitleFor(host) {
  const m = meta[host] ?? meta[host.replace(/^www\./, "")];
  if (!m || !m.title) return undefined;
  const c = cleanTitle(m.title);
  return c.length >= 4 ? c : undefined;
}

async function redis(command) {
  const res = await fetch(`${url.replace(/\/$/, "")}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`upstash http ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j.error) throw new Error(`upstash error: ${j.error}`);
  return j.result;
}

async function pipeline(commands) {
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`upstash pipeline http ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const bad = Array.isArray(j) ? j.findIndex((r) => r && r.error) : -1;
  if (bad >= 0) throw new Error(`pipeline step ${bad} failed: ${j[bad].error}`);
}

const raw = (await redis(["LRANGE", KEY, "0", "599"])) ?? [];
const entries = raw
  .map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  })
  .filter((e) => e !== null);

let filled = 0;
let already = 0;
let skipped = 0;
const updated = [];
for (const e of entries) {
  const grade = String(e.grade ?? "");
  const isTop = grade === "A+" || grade === "A";
  if (!e.desc && isTop) {
    const d = metaTitleFor(String(e.host ?? ""));
    if (d) {
      updated.push({ ...e, desc: d });
      filled++;
      continue;
    }
    skipped++;
  } else if (e.desc) {
    already++;
  }
  updated.push(e);
}

console.log(`entries: ${entries.length}, filled: ${filled}, already had desc: ${already}, no title in meta: ${skipped}`);
for (const e of updated.slice(0, 8)) {
  if (e.desc) console.log(`  ${e.host} [${e.grade}]: ${e.desc}`);
}

if (push && filled > 0) {
  // restore the exact list order: stored newest-first (LPUSH), so RPUSH from
  // the oldest end; pipeline is chunked to keep requests reasonable
  await pipeline([["DEL", KEY]]);
  const ordered = [...updated].reverse();
  for (let i = 0; i < ordered.length; i += 100) {
    const chunk = ordered.slice(i, i + 100).map((e) => ["RPUSH", KEY, JSON.stringify(e)]);
    await pipeline(chunk);
  }
  const len = await redis(["LLEN", KEY]);
  console.log(`pushed: list length now ${len}`);
} else {
  console.log("dry run - rerun with --push to write");
}
