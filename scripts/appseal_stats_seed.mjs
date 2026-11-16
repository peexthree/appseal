/**
 * One-time seed: pushes the historical mass-run scans (scripts/benchmark_data)
 * into the live /stats counters in prod Redis. Idempotent - guarded by the
 * appmot:stats:seeded marker key; --force re-seeds (doubles counters, careful).
 *
 * Usage: node scripts/appseal_stats_seed.mjs [--force]
 * Requires UPSTASH_REDIS_REST_URL/TOKEN in D:/BIR/.env.
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
const HOST_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const GRADE_RE = /^[A-E]\+?$/;
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
    const seeded = await pipeline([["SET", "appmot:stats:seeded", "1", "NX", "GET"]]);
    // SET NX GET returns the old value when the key existed
    if (seeded[0] === "1") {
      console.log("already seeded (appmot:stats:seeded exists) - use --force to re-seed");
      return;
    }
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const cmds = [];
  let used = 0;
  let skipped = 0;
  const hosts = new Set();
  const titles = new Set();
  const grades = {};
  for (const f of files) {
    let j;
    try {
      j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8"));
    } catch {
      skipped++;
      continue;
    }
    const host = String(j.host ?? "").toLowerCase().replace(/^www\./, "");
    if (!HOST_RE.test(host) || !GRADE_RE.test(String(j.grade)) || !Array.isArray(j.results) || j.results.length === 0) {
      skipped++;
      continue;
    }
    used++;
    hosts.add(host);
    grades[j.grade] = (grades[j.grade] ?? 0) + 1;
    cmds.push(
      ["INCR", "appmot:stats:scans"],
      ["SADD", "appmot:stats:hosts", host],
      ["HINCRBY", "appmot:stats:grades", j.grade, "1"],
      ["ZINCRBY", "appmot:stats:scores", "1", String(j.score)],
    );
    for (const r of j.results) {
      if (r.status !== "fail" && r.status !== "warn") continue;
      const key = r.status === "fail" ? "appmot:stats:checkfails" : "appmot:stats:checkwarns";
      cmds.push(["ZINCRBY", key, "1", r.id]);
      if (!titles.has(r.id) && r.title) {
        titles.add(r.id);
        cmds.push(["HSETNX", "appmot:stats:titles", r.id, JSON.stringify(r.title)]);
      }
    }
  }

  // seed marker first: a mid-run failure leaves the guard set, a rerun would
  // double-count - use --force deliberately in that case
  cmds.unshift(["SET", "appmot:stats:seeded", "1", "NX"]);

  let done = 0;
  for (let i = 0; i < cmds.length; i += BATCH) {
    await pipeline(cmds.slice(i, i + BATCH));
    done = Math.min(cmds.length, i + BATCH);
    process.stdout.write(`\r${done}/${cmds.length} commands`);
  }
  console.log(`\nscans seeded: ${used}, skipped files: ${skipped}, unique hosts: ${hosts.size}`);
  console.log("grades:", JSON.stringify(grades));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
