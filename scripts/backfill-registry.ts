/**
 * One-shot idempotent backfill: copies the public registry entries
 * (getRegistryEntries from src/lib/scanner/store.ts) into the durable
 * `scans` archive table. A registry entry id IS the scan id, so
 * ON CONFLICT (id) DO NOTHING never duplicates a live archived row -
 * only registry entries still missing from the archive get inserted.
 *
 * Run (from the project root):
 *   node --experimental-strip-types --env-file=.env scripts/backfill-registry.ts
 *
 * Why module.registerHooks: node --experimental-strip-types cannot resolve
 * store.ts's own extensionless import ("../registry"), which makes importing
 * the real getRegistryEntries impossible without a hook. The hook appends
 * ".ts" to extensionless RELATIVE specifiers only (what bundlers do), so the
 * script runs the actual prod code path (Upstash Redis backend, or the
 * db/registry.json file backend when Redis is not configured) instead of a
 * copy of it. Requires Node >= 22.15 (module.registerHooks).
 */

import { registerHooks } from "node:module";
import postgres from "postgres";
import { isDbEnabled } from "../src/lib/db/index.ts";
import type { RegistryEntry } from "../src/lib/scanner/store.ts";

if (typeof registerHooks !== "function") {
  console.error("This script needs Node >= 22.15 (module.registerHooks). Current:", process.version);
  process.exit(1);
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      const relative = specifier.startsWith("./") || specifier.startsWith("../");
      if (relative && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + ".ts", context);
      throw e;
    }
  },
});

// after the hook is registered, the real store module loads fine
const { getRegistryEntries } = await import("../src/lib/scanner/store.ts");

if (!isDbEnabled()) {
  console.error("DATABASE_URL is not set (or is not a postgres:// URL) - the durable store is off.");
  console.error("Add DATABASE_URL to .env (Supabase connection string, session/transaction pooler) and retry:");
  console.error("  node --experimental-strip-types --env-file=.env scripts/backfill-registry.ts");
  process.exit(1);
}

const BATCH = 100;

try {
  const entries: RegistryEntry[] = await getRegistryEntries();
  const valid = entries.filter(
    (e) => e && e.id && e.host && typeof e.ts === "number" && Number.isFinite(e.ts),
  );
  console.log(`registry entries read: ${entries.length} (usable: ${valid.length})`);

  // same connection shape as src/lib/db/index.ts: prepare:false is required
  // behind the Supabase transaction pooler, max:5 stays inside connection
  // limits. DDL is not needed here - the scans table already exists
  // (ensureSchemaNow / scripts/db-migrate.ts).
  const sql = postgres(process.env.DATABASE_URL as string, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    const rows = batch.map((e) => ({
      id: e.id,
      host: e.host,
      score: e.score,
      grade: e.grade,
      is_public: true,
      lang: null,
      platform: null,
      result: null,
      // started_at = finished_at = the scan instant: a JS Date parameter
      // serializes to the same timestamptz value as to_timestamp(ts/1000)
      started_at: new Date(e.ts),
      finished_at: new Date(e.ts),
    }));
    // one multi-row statement per batch (not one query per entry);
    // a row conflicting on an existing scan id is silently skipped.
    // The sql(rows, ...cols) helper emits BOTH the column list and the
    // VALUES rows itself - an explicit column list would duplicate it.
    const res = await sql`
      insert into scans
      ${sql(rows, "id", "host", "score", "grade", "is_public", "lang", "platform", "result", "started_at", "finished_at")}
      on conflict (id) do nothing
    `.execute();
    inserted += res.count ?? 0;
    skipped += batch.length - (res.count ?? 0);
    console.log(
      `batch ${Math.floor(i / BATCH) + 1}: inserted ${res.count ?? 0}, skipped ${batch.length - (res.count ?? 0)} (conflict)`,
    );
  }

  console.log(`done: read ${entries.length} / inserted ${inserted} / skipped ${skipped} (conflict on existing scan ids)`);
  await sql.end({ timeout: 5 }).catch(() => undefined);
  process.exit(0);
} catch (e) {
  console.error("backfill failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
