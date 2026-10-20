-- RUG CHECK schema for Neon (or any Postgres 14+).
-- Apply with `npm run db:migrate` or paste into the Neon SQL Editor. Safe to re-run.
-- Only the server connects (DATABASE_URL); never expose the connection string to the browser.


-- ---------- scan cache (5 min per mint) ----------
create table if not exists public.scan_cache (
  mint         text primary key,
  report       jsonb not null,
  explanation  jsonb,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

-- ---------- scan log (feeds history, public feed and stats) ----------
create table if not exists public.scans (
  id          bigserial primary key,
  mint        text not null,
  name        text,
  symbol      text,
  score       smallint not null,
  label       text not null,
  wallet      text,
  ip_hash     text,
  via         text not null default 'web', -- web | bulk | api | alert
  created_at  timestamptz not null default now()
);
create index if not exists scans_created_idx on public.scans (created_at desc);
create index if not exists scans_wallet_idx on public.scans (wallet, created_at desc);
create index if not exists scans_mint_idx on public.scans (mint, created_at desc);

-- ---------- fixed-window counters (rate limits + daily quotas) ----------
create table if not exists public.usage_counters (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  expires_at    timestamptz not null,
  primary key (key, window_start)
);
create index if not exists usage_counters_expires_idx on public.usage_counters (expires_at);

create or replace function public.incr_counter(p_key text, p_window timestamptz, p_expires timestamptz)
returns integer
language sql
as $$
  insert into public.usage_counters (key, window_start, count, expires_at)
  values (p_key, p_window, 1, p_expires)
  on conflict (key, window_start) do update set count = public.usage_counters.count + 1
  returning count;
$$;

-- ---------- wallet auth ----------
create table if not exists public.auth_nonces (
  nonce       text primary key,
  wallet      text not null,
  message     text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists auth_nonces_expires_idx on public.auth_nonces (expires_at);

create table if not exists public.wallets (
  address     text primary key,
  tier        smallint not null default 0,
  balance     numeric not null default 0,
  checked_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ---------- watchlists + alerts ----------
create table if not exists public.watchlists (
  id                      uuid primary key default gen_random_uuid(),
  wallet                  text not null,
  name                    text not null,
  alert_score_change      boolean not null default true,
  alert_authority         boolean not null default true,
  alert_liquidity_drop_pct smallint not null default 30,
  alert_holder_dump_pct   numeric not null default 5,
  webhook_url             text,
  created_at              timestamptz not null default now()
);
create index if not exists watchlists_wallet_idx on public.watchlists (wallet);

create table if not exists public.watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  mint          text not null,
  name          text,
  symbol        text,
  snapshot      jsonb,
  checked_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (watchlist_id, mint)
);
create index if not exists watchlist_items_checked_idx on public.watchlist_items (checked_at nulls first);

create table if not exists public.alerts (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null,
  watchlist_id  uuid references public.watchlists(id) on delete set null,
  mint          text not null,
  kind          text not null,
  message       text not null,
  details       jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists alerts_wallet_idx on public.alerts (wallet, created_at desc);

-- ---------- tier 3 API keys (only a SHA-256 hash is stored) ----------
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null,
  name          text not null,
  prefix        text not null,
  key_hash      text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_keys_wallet_idx on public.api_keys (wallet);

-- ---------- read helpers ----------
create or replace function public.recent_scans(p_limit integer)
returns table (mint text, name text, symbol text, score smallint, label text, created_at timestamptz)
language sql stable
as $$
  select mint, name, symbol, score, label, created_at from (
    select distinct on (mint) mint, name, symbol, score, label, created_at
    from public.scans
    where created_at > now() - interval '2 days' and via <> 'alert'
    order by mint, created_at desc
  ) latest
  order by created_at desc
  limit least(p_limit, 50);
$$;

create or replace function public.scan_stats()
returns json
language sql stable
as $$
  select json_build_object(
    'total_scans', (select count(*) from public.scans),
    'flagged_today', (
      select count(distinct mint) from public.scans
      where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
        and score >= 50
    ),
    'scans_today', (
      select count(*) from public.scans
      where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    )
  );
$$;

-- Housekeeping: call from the cron route to keep the free tier small.
create or replace function public.prune_expired()
returns void
language sql
as $$
  delete from public.usage_counters where expires_at < now();
  delete from public.auth_nonces where expires_at < now() - interval '1 day';
  delete from public.scan_cache where expires_at < now() - interval '1 hour';
$$;

