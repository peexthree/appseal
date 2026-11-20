/**
 * Durable store (Supabase Postgres), optional by design: every helper is a
 * no-op unless DATABASE_URL is set. Redis stays the hot path (quotas, locks,
 * pass gating, registry feed); this module is the "eternal memory":
 * scan archive (findings outlive the 7-day Redis TTL), purchase ledger,
 * pass mirror, API-token mirror.
 *
 * All helpers swallow errors and resolve to null - a DB outage must never
 * break the scan or payment flows it piggybacks on.
 *
 * 152-FZ: only non-personal references are written (tg chat id, payment id,
 * domain, grade). No emails, no names.
 */

import postgres from "postgres";
import type { ScanResult } from "../scanner/types.ts";
import type { PassRecord } from "../passes.ts";

const DDL_STATEMENTS = [
  `create table if not exists users (
     tg_chat_id text primary key,
     lang text default 'ru',
     created_at timestamptz not null default now()
   )`,
  `create table if not exists scans (
     id text primary key,
     host text not null,
     score integer not null default 0,
     grade text not null,
     is_public boolean not null default true,
     lang text,
     platform text,
     result jsonb,
     started_at timestamptz,
     finished_at timestamptz not null default now()
   )`,
  `create index if not exists scans_host_finished_idx on scans (host, finished_at desc)`,
  `create table if not exists purchases (
     payment_id text primary key,
     provider text not null,
     plan text not null,
     amount numeric,
     currency text,
     tg_chat_id text,
     status text not null default 'pending',
     created_at timestamptz not null default now()
   )`,
  `create table if not exists passes (
     host text primary key,
     chat_id text,
     kind text not null,
     purchase_id text,
     days integer,
     expires_at timestamptz not null,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists passes_expires_idx on passes (expires_at desc)`,
  `create table if not exists api_tokens (
     token_hash text primary key,
     chat_id text not null,
     plan text not null default 'pro',
     created_at timestamptz not null default now(),
     expires_at timestamptz,
     revoked_at timestamptz
   )`,
  `create table if not exists reviews (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     rating integer not null,
     host text,
     body text not null,
     lang text not null default 'ru',
     status text not null default 'pending',
     featured boolean not null default false,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists reviews_status_idx on reviews (status, created_at desc)`,
  // fresh installs get the column from the create-table above; already
  // provisioned tables (migration 0001) pick it up here - both idempotent
  `alter table reviews add column if not exists featured boolean not null default false`,
];

// tables that carry RLS (see below) - the pre-check in ensureSchema reads
// pg_class instead of re-issuing these ALTERs on every cold start
const RLS_TABLES = ["users", "scans", "purchases", "passes", "api_tokens", "reviews"];

// RLS on every table: the Supabase anon key (REST API) gets deny-all -
// this app only reads/writes through the direct server-side connection,
// which runs as the table owner and bypasses RLS. Kept separate from the
// base DDL because these are the statements the cold-start pre-check skips.
const RLS_DDL = RLS_TABLES.map(
  (t) => `alter table ${t} enable row level security`,
);

let client: postgres.Sql | null = null;
let schemaReady = false;
// one shared DDL promise: concurrent first queries must not race CREATE INDEX
let schemaPromise: Promise<void> | null = null;

export function isDbEnabled(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  // only a real Postgres URL enables the store: a template placeholder
  // (file:./db/custom.db) or a REST url must degrade to "no database"
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function db(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url || !isDbEnabled()) return null;
  if (!client) {
    try {
      // prepare: false - required behind the Supabase transaction pooler;
      // a small pool keeps serverless instances inside connection limits
      client = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
    } catch {
      client = null;
    }
  }
  return client;
}

// RLS statements run on every cold start unless pre-checked away: each
// `alter table ... enable row level security` takes an AccessExclusiveLock,
// and a burst of cold lambda instances would queue behind each other's
// ALTERs (the "DDL storm"). The pre-check below reads relrowsecurity (no
// locks, one round trip) and only ALTERs tables that still need it.
async function ensureSchema(sql: postgres.Sql): Promise<void> {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      // which RLS ALTERs are still needed? (relnamespace pinned to public -
      // Supabase keeps its own auth.users with RLS already on; relkind 'r'
      // excludes views). Steady state: zero ALTERs, no exclusive locks.
      let needRls: Set<string>;
      try {
        const on = (await sql`
          select relname from pg_class
          where relrowsecurity and relkind = 'r'
            and relnamespace = 'public'::regnamespace
            and relname in ${sql(RLS_TABLES)}
        `) as Array<{ relname: string }>;
        needRls = new Set(RLS_TABLES.filter((t) => !on.some((row) => row.relname === t)));
      } catch {
        needRls = new Set(RLS_TABLES); // pre-check failed: run the full set
      }
      const stmts = [...DDL_STATEMENTS, ...RLS_DDL.filter((_, i) => needRls.has(RLS_TABLES[i]))];
      for (const stmt of stmts) {
        await sql.unsafe(stmt);
      }
    })()
      .then(() => {
        schemaReady = true;
      })
      .catch((e) => {
        schemaPromise = null; // a failed attempt may be retried on the next query
        throw e;
      });
  }
  await schemaPromise;
}

/** DDL + liveness probe for the migrate script and healthz. */
export async function ensureSchemaNow(): Promise<{ ok: boolean; detail: string }> {
  const sql = db();
  if (!sql) return { ok: false, detail: "DATABASE_URL not set" };
  try {
    await ensureSchema(sql);
    await sql`select 1`;
    return { ok: true, detail: "schema ready" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Archive one finished scan (full findings JSONB) - the durable twin of the
 *  7-day Redis record. Called from the scan pipeline after runScan. The scan
 *  engine reports grade as a plain string, so the archive input relaxes the
 *  union - the column is text anyway. */
export async function archiveScan(
  scan: Omit<ScanResult, "grade"> & { grade: string },
  isPublic: boolean,
): Promise<boolean> {
  const sql = db();
  if (!sql) return false;
  try {
    await ensureSchema(sql);
    const platform = typeof scan.platform === "string" ? scan.platform : null;
    await sql`
      insert into scans (id, host, score, grade, is_public, lang, platform, result, started_at, finished_at)
      values (${scan.id}, ${scan.host}, ${scan.score}, ${scan.grade}, ${isPublic}, ${scan.lang ?? null},
              ${platform}, ${sql.json(scan)}, ${scan.startedAt}, ${scan.finishedAt})
      on conflict (id) do update set
        score = excluded.score, grade = excluded.grade, result = excluded.result,
        finished_at = excluded.finished_at
    `.execute();
    return true;
  } catch {
    return false;
  }
}

export interface GradeMovementRow {
  host: string;
  grade: string;
  ts: number;
}

/**
 * Scan history for the /stats rescan-dynamics block: one row per public scan
 * of every host that was scanned more than once, newest first. The registry
 * list keeps a bounded window, so real first-to-last grade movement (including
 * the pre-registry rescans) has to come from the durable scans archive.
 * Null on no-database or query failure - the caller falls back to the
 * registry-window computation.
 */
export async function gradeMovementRows(): Promise<GradeMovementRow[] | null> {
  const sql = db();
  if (!sql) return null;
  try {
    await ensureSchema(sql);
    const rows = await sql`
      with multi as (
        select host from scans
        where is_public and grade is not null and finished_at is not null
        group by host having count(*) > 1
      )
      select s.host, s.grade, s.finished_at
      from scans s
      join multi m on m.host = s.host
      where s.is_public and s.grade is not null and s.finished_at is not null
      order by s.finished_at desc
      limit 20000
    `;
    return rows.map((r) => ({
      host: String(r.host),
      grade: String(r.grade),
      ts: new Date(r.finished_at).getTime(),
    }));
  } catch {
    return null;
  }
}

export interface HostScanRow {
  id: string;
  host: string;
  score: number;
  grade: string;
  ts: number;
}

/**
 * Public scan history of one host, oldest first - the /verified profile
 * chart. Replaces the full-registry scan the page used to do (the 16k+-entry
 * LRANGE per profile view) with an indexed per-host query. Null on
 * no-database or query failure, so the caller can fall back to Redis.
 */
export async function hostScanHistory(host: string, limit = 20): Promise<HostScanRow[] | null> {
  const sql = db();
  if (!sql) return null;
  try {
    await ensureSchema(sql);
    const rows = await sql`
      select id, host, score, grade, finished_at
      from scans
      where host = ${host} and is_public and grade is not null
      order by finished_at asc
      limit ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      host: String(r.host),
      score: Number(r.score),
      grade: String(r.grade),
      ts: new Date(r.finished_at).getTime(),
    }));
  } catch {
    return null;
  }
}

export interface PurchaseLedgerRow {
  paymentId: string;
  provider: "yookassa" | "lava";
  plan: "lpass" | "lpro" | "lpack";
  amount?: number | null;
  currency?: string | null;
  chatId?: string | null;
  status: "pending" | "succeeded" | "canceled";
}

/** Purchase ledger, upserted by payment id: the webhook sets the final status,
 *  the invoice-creation path records "pending" first. Idempotent on replays. */
export async function ledgerPurchase(row: PurchaseLedgerRow): Promise<boolean> {
  const sql = db();
  if (!sql) return false;
  try {
    await ensureSchema(sql);
    await sql`
      insert into purchases (payment_id, provider, plan, amount, currency, tg_chat_id, status)
      values (${row.paymentId}, ${row.provider}, ${row.plan}, ${row.amount ?? null},
              ${row.currency ?? null}, ${row.chatId ?? null}, ${row.status})
      on conflict (payment_id) do update set
        status = excluded.status, tg_chat_id = coalesce(excluded.tg_chat_id, purchases.tg_chat_id)
    `.execute();
    return true;
  } catch {
    return false;
  }
}

/** Pass mirror: one row per host, the latest purchase wins. Redis stays the
 *  gating source; this row feeds expiry queries and the audit trail. */
export async function mirrorPass(record: PassRecord): Promise<boolean> {
  const sql = db();
  if (!sql) return false;
  try {
    await ensureSchema(sql);
    const kind = record.days === 30 ? "pro" : record.days === 7 ? "launch" : "launch";
    await sql`
      insert into passes (host, kind, purchase_id, days, expires_at)
      values (${record.host}, ${kind}, ${record.paymentId}, ${record.days ?? null}, ${record.until})
      on conflict (host) do update set
        kind = excluded.kind, purchase_id = excluded.purchase_id,
        days = excluded.days, expires_at = excluded.expires_at
    `.execute();
    return true;
  } catch {
    return false;
  }
}

export async function saveApiTokenRow(
  tokenHash: string,
  chatId: string,
  expiresAt: string,
): Promise<boolean> {
  const sql = db();
  if (!sql) return false;
  try {
    await ensureSchema(sql);
    await sql`
      insert into api_tokens (token_hash, chat_id, expires_at)
      values (${tokenHash}, ${chatId}, ${expiresAt})
      on conflict (token_hash) do update set chat_id = excluded.chat_id, expires_at = excluded.expires_at
    `.execute();
    return true;
  } catch {
    return false;
  }
}

/** PG fallback for token lookup (Redis is the primary, see api-tokens.ts). */
export async function findApiTokenRow(
  tokenHash: string,
): Promise<{ chatId: string; expiresAt: string | null } | null> {
  const sql = db();
  if (!sql) return null;
  try {
    await ensureSchema(sql);
    const rows = await sql`
      select chat_id, expires_at from api_tokens
      where token_hash = ${tokenHash} and revoked_at is null
      and (expires_at is null or expires_at > now())
      limit 1
    `;
    const r = rows[0];
    return r ? { chatId: String(r.chat_id), expiresAt: r.expires_at ? String(r.expires_at) : null } : null;
  } catch {
    return null;
  }
}

/** Self-service deletion (the bot /delete command): wipe the chat from users,
 *  sever the chat id from the purchase ledger (the payment_id/amount/currency
 *  row stays for the 3-year tax retention, now non-personal), drop passes and
 *  api tokens bound to the chat. Scan rows are domain-keyed (never personal)
 *  and stay; domain owners can opt out via robots.txt / registry removal.
 *  Returns true when every statement ran - the caller reports partial failure
 *  honestly if the DB was unreachable. */
export async function deleteUserData(chatId: string): Promise<boolean> {
  const sql = db();
  if (!sql) return false;
  try {
    await ensureSchema(sql);
    await sql`delete from users where tg_chat_id = ${chatId}`.execute();
    await sql`update purchases set tg_chat_id = null where tg_chat_id = ${chatId}`.execute();
    await sql`delete from api_tokens where chat_id = ${chatId}`.execute();
    await sql`delete from passes where chat_id = ${chatId}`.execute();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Reviews: visitor testimonials, moderated before they go public      */
/* ------------------------------------------------------------------ */

export interface ReviewInput {
  name: string;
  rating: number;
  host?: string | null;
  body: string;
  lang?: "ru" | "en";
}

/** Queue one review for moderation; returns its id (the Telegram approval
 *  buttons carry it), or null when the DB is off / the insert failed. */
export async function insertReview(row: ReviewInput): Promise<string | null> {
  const sql = db();
  if (!sql) return null;
  try {
    await ensureSchema(sql);
    const rows = await sql`
      insert into reviews (name, rating, host, body, lang)
      values (${row.name}, ${row.rating}, ${row.host ?? null}, ${row.body}, ${row.lang ?? "ru"})
      returning id
    `.execute();
    const r = rows[0];
    return r ? String(r.id) : null;
  } catch {
    return null;
  }
}

export interface PublicReview {
  id: string;
  name: string;
  rating: number;
  host: string | null;
  body: string;
  lang: string;
  featured: boolean;
  createdAt: string;
}

/** The showcase: pinned reviews first, then newest first. */
export async function listApprovedReviews(limit = 12): Promise<PublicReview[]> {
  const sql = db();
  if (!sql) return [];
  try {
    await ensureSchema(sql);
    const rows = await sql`
      select id, name, rating, host, body, lang, featured, created_at
      from reviews where status = 'approved'
      order by featured desc, created_at desc limit ${Math.max(1, Math.min(50, limit))}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      rating: Number(r.rating),
      host: r.host ? String(r.host) : null,
      body: String(r.body),
      lang: String(r.lang ?? "ru"),
      featured: Boolean(r.featured),
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Telegram moderation verdict: approved/rejected, re-decidable (a moderator
 *  may change their mind - the showcase always mirrors the latest verdict). */
export async function updateReviewStatus(id: string, status: "approved" | "rejected"): Promise<boolean> {
  const sql = db();
  if (!sql) return false;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  try {
    await ensureSchema(sql);
    const rows = await sql`
      update reviews set status = ${status} where id = ${id}
    `.execute();
    return rows.count > 0;
  } catch {
    return false;
  }
}

/** Moderator's showcase pin (the third ⭐ button on the Telegram alert):
 *  featured reviews lead the showcase and the landing strip. */
export async function setReviewFeatured(id: string, featured: boolean): Promise<boolean> {
  const sql = db();
  if (!sql) return false;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  try {
    await ensureSchema(sql);
    const rows = await sql`
      update reviews set featured = ${featured} where id = ${id} and status = 'approved'
    `.execute();
    return rows.count > 0;
  } catch {
    return false;
  }
}

/** Housekeeping (pipeline-tick): drop rejected reviews after the retention
 *  window stated in /legal (14 days). Returns the removed count. */
export async function deleteRejectedReviews(olderThanDays = 14): Promise<number> {
  const sql = db();
  if (!sql) return 0;
  try {
    await ensureSchema(sql);
    const rows = await sql`
      delete from reviews
      where status = 'rejected' and created_at < now() - (${olderThanDays} || ' days')::interval
      returning id
    `.execute();
    return rows.length;
  } catch {
    return 0;
  }
}
