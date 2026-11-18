/**
 * One-shot idempotent DDL migration: creates the durable-store tables
 * (users, scans, purchases, passes, api_tokens) when DATABASE_URL is set.
 * Run: node --experimental-strip-types scripts/db-migrate.ts
 */

import { isDbEnabled, ensureSchemaNow } from "../src/lib/db/index.ts";

const res = isDbEnabled() ? await ensureSchemaNow() : { ok: false, detail: "DATABASE_URL not set" };
if (!res.ok) {
  console.error("DB migration failed:", res.detail);
  process.exit(1);
}
console.log("DB migration ok:", res.detail);
process.exit(0);
