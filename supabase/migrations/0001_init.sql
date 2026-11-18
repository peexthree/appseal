-- AppSeal durable store: initial schema. Idempotent (IF NOT EXISTS) - safe
-- to re-run; the runtime client (src/lib/db/index.ts) runs the same DDL
-- lazily, this file exists for the Supabase GitHub integration.
-- RLS is enabled everywhere: the Supabase anon key gets deny-all, the app
-- writes through the direct server-side Postgres connection only.

create table if not exists users (
  tg_chat_id text primary key,
  lang text default 'ru',
  created_at timestamptz not null default now()
);

create table if not exists scans (
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
);
create index if not exists scans_host_finished_idx on scans (host, finished_at desc);

create table if not exists purchases (
  payment_id text primary key,
  provider text not null,
  plan text not null,
  amount numeric,
  currency text,
  tg_chat_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists passes (
  host text primary key,
  chat_id text,
  kind text not null,
  purchase_id text,
  days integer,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists passes_expires_idx on passes (expires_at desc);

create table if not exists api_tokens (
  token_hash text primary key,
  chat_id text not null,
  plan text not null default 'pro',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rating integer not null,
  host text,
  body text not null,
  lang text not null default 'ru',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists reviews_status_idx on reviews (status, created_at desc);

alter table users enable row level security;
alter table scans enable row level security;
alter table purchases enable row level security;
alter table passes enable row level security;
alter table api_tokens enable row level security;
alter table reviews enable row level security;
