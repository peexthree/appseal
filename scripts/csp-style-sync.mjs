/**
 * CSP style-hash sync for the landing page (the only page whose CSP must be
 * free of 'unsafe-inline': it is the page our own scanner grades).
 *
 * The landing is force-dynamic, so its HTML cannot be extracted at build
 * time - but every inline style it renders is deterministic per build: the
 * next/font fallback <style> blocks and the framer-motion initial style
 * attribute strings are constants. That makes 'unsafe-hashes' + sha256
 * hashes a complete replacement for style-src 'unsafe-inline'.
 *
 * Modes:
 *   node scripts/csp-style-sync.mjs            # sync: fetch prod, write src/generated/csp-style-hashes.json
 *   node scripts/csp-style-sync.mjs --check    # verify: served page vs committed JSON, exit 1 on drift
 *   node scripts/csp-style-sync.mjs --file f   # extract from a local HTML file instead of prod
 *
 * After ANY change that touches landing styles: run sync, commit the JSON,
 * deploy - then re-run with --check. A drifted JSON silently blocks the
 * landing's styles, so --check should run in CI after every deploy.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const OUT = "src/generated/csp-style-hashes.json";
const URLS = ["https://appseal.online/", "https://appseal.online/en"];
const UA_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; AppSeal-CSP-Sync)" };

const decodeEntities = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function extract(html) {
  const styles = new Set();
  const attrs = new Set();
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles.add(m[1]);
  for (const m of html.matchAll(/style="([^"]*)"/g)) attrs.add(decodeEntities(m[1]));
  return { styles: [...styles], attrs: [...attrs] };
}

const sha = (s) => "'sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64") + "'";

async function fetchPage(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: UA_HEADERS, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((s) => setTimeout(s, 1500));
    }
  }
}

const arg = process.argv[2] ?? "";
if (arg === "--check") {
  const committed = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const coverage = new Set([...committed.styleHashes, ...committed.attrHashes]);
  let drift = 0;
  for (const url of URLS) {
    const { styles, attrs } = extract(await fetchPage(url));
    for (const s of styles) {
      if (!coverage.has(sha(s))) {
        drift++;
        console.error("DRIFT style element not covered:", JSON.stringify(s.slice(0, 90)));
      }
    }
    for (const a of attrs) {
      if (!coverage.has(sha(a))) {
        drift++;
        console.error("DRIFT style attribute not covered:", JSON.stringify(a.slice(0, 90)));
      }
    }
    console.log(url, "-> styles", styles.length, "attrs", attrs.length, "all covered:", drift === 0);
  }
  if (drift > 0) {
    console.error(`\n${drift} uncovered value(s). Landing styles are blocked by the served CSP.`);
    console.error("Fix: node scripts/csp-style-sync.mjs && commit && deploy.");
    process.exit(1);
  }
  console.log("CSP style hashes cover the served landing: OK");
} else if (arg === "--file") {
  const html = fs.readFileSync(process.argv[3], "utf8");
  const { styles, attrs } = extract(html);
  writeJson(styles, attrs, "local file " + process.argv[3]);
} else {
  // union with the committed list: some landing style values render only in
  // certain states (conditional accent colors, live-counter variants) - a
  // single prod fetch cannot enumerate them all, so proven hashes accumulate
  const prev = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, "utf8"))
    : { styleHashes: [], attrHashes: [] };
  const styles = new Set();
  const attrs = new Set();
  for (const url of URLS) {
    const part = extract(await fetchPage(url));
    for (const s of part.styles) styles.add(s);
    for (const a of part.attrs) attrs.add(a);
  }
  // carry proven hashes whose source values we cannot re-derive here
  const prevStyleValues = (prev.styleValues ?? []).concat([...styles]);
  const prevAttrValues = (prev.attrValues ?? []).concat([...attrs]);
  writeJson([...new Set(prevStyleValues)], [...new Set(prevAttrValues)], URLS.join(", ") + " (merged with previous)");
}

function writeJson(styles, attrs, source) {
  const json = {
    generatedAt: new Date().toISOString(),
    source,
    note: "sha256 hashes of every inline <style> block and style= attribute the landing renders; consumed by src/middleware.ts - regenerate with scripts/csp-style-sync.mjs after landing style changes",
    styleValues: styles,
    attrValues: attrs,
    styleHashes: [...new Set(styles.map(sha))].sort(),
    attrHashes: [...new Set(attrs.map(sha))].sort(),
  };
  fs.mkdirSync("src/generated", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(json, null, 2) + "\n", "utf-8");
  console.log("wrote", OUT, "-", json.styleHashes.length, "style hashes,", json.attrHashes.length, "attr hashes");
}
