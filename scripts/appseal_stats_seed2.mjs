/**
 * Seed v2: backfills the per-category counters (appmot:stats:catfails /
 * catwarns / catloss) from the historical mass run. Guarded by its own
 * marker so it never double-counts; --force re-seeds deliberately.
 *
 * Usage: node scripts/appseal_stats_seed2.mjs [--force]
 */
import fs from "node:fs";
import path from "node:path";

const envText = fs.readFileSync("D:/BIR/.env", "utf-8");
const pick = (k) => {
  const m = envText.match(new RegExp(`${k}\\s*=\\s*"?([^"\\r\\n]+)"?`));
  return m ? m[1].trim() : null;
};
const base = pick("UPSTASH_REDIS_REST_URL");
const token = pick("UPSTASH_REDIS_REST_TOKEN");
if (!base || !token) {
  console.error("no Upstash env in D:/BIR/.env");
  process.exit(1);
}
const url = base.replace(/\/$/, "") + "/pipeline";
if (!/^https:\/\/[a-z0-9-]+\.upstash\.io\/pipeline\/?$/.test(url)) {
  console.error("unexpected Upstash endpoint:", url);
  process.exit(1);
}

const FORCE = process.argv.includes("--force");
const DIR = "scripts/benchmark_data";
const MARKER = "appmot:stats:seeded2";
const BATCH = 400;

async function pipeline(cmds) {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error(`pipeline ${res.status}`);
  const data = await res.json();
  for (const d of data) {
    if (d && d.error) throw new Error(`redis: ${d.error}`);
  }
  return data.map((d) => d?.result ?? null);
}

async function main() {
  if (!FORCE) {
    const seeded = await pipeline([["SET", MARKER, "1", "NX", "GET"]]);
    if (seeded[0] === "1") {
      console.log("already seeded (appmot:stats:seeded2) - use --force to re-seed");
      return;
    }
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const cmds = [["SET", MARKER, "1", "NX"]];
  let used = 0;
  for (const f of files) {
    let j;
    try {
      j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8"));
    } catch {
      continue;
    }
    if (!Array.isArray(j.results) || j.results.length === 0) continue;
    used++;
    for (const r of j.results) {
      if (r.status !== "fail" && r.status !== "warn") continue;
      if (!r.category) continue;
      const key = r.status === "fail" ? "appmot:stats:catfails" : "appmot:stats:catwarns";
      cmds.push(["HINCRBY", key, r.category, "1"]);
      if (typeof r.penalty === "number" && r.penalty > 0) {
        cmds.push(["HINCRBY", "appmot:stats:catloss", r.category, String(Math.round(r.penalty))]);
      }
    }
  }

  let done = 0;
  for (let i = 0; i < cmds.length; i += BATCH) {
    await pipeline(cmds.slice(i, i + BATCH));
    done = Math.min(cmds.length, i + BATCH);
    process.stdout.write(`\r${done}/${cmds.length} commands`);
  }
  console.log(`\nscans aggregated: ${used}, commands: ${cmds.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
