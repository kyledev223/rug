import { neon } from "@neondatabase/serverless";
import type { AlertRow, ApiKeyRow, Repo, ScanRow, Stats, WalletRow, WatchItem, Watchlist } from "./types";
import type { Explanation, ScanReport } from "@/lib/scan/types";

type Row = Record<string, unknown>;

/** Postgres returns timestamptz as Date and numeric/bigint as strings; normalize to the app's shapes. */
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

function scanRow(r: Row): ScanRow {
  return {
    mint: String(r.mint),
    name: (r.name as string | null) ?? null,
    symbol: (r.symbol as string | null) ?? null,
    score: num(r.score),
    label: r.label as ScanRow["label"],
    created_at: iso(r.created_at)!,
  };
}

function listRow(r: Row): Omit<Watchlist, "items"> {
  return {
    id: String(r.id),
    wallet: String(r.wallet),
    name: String(r.name),
    alert_score_change: Boolean(r.alert_score_change),
    alert_authority: Boolean(r.alert_authority),
    alert_liquidity_drop_pct: num(r.alert_liquidity_drop_pct),
    alert_holder_dump_pct: num(r.alert_holder_dump_pct),
    webhook_url: (r.webhook_url as string | null) ?? null,
    created_at: iso(r.created_at)!,
  };
}

function itemRow(r: Row): WatchItem {
  return {
    id: String(r.id),
    watchlist_id: String(r.watchlist_id),
    mint: String(r.mint),
    name: (r.name as string | null) ?? null,
    symbol: (r.symbol as string | null) ?? null,
    snapshot: (r.snapshot as WatchItem["snapshot"]) ?? null,
    checked_at: iso(r.checked_at),
    created_at: iso(r.created_at)!,
  };
}

function keyRow(r: Row): ApiKeyRow {
  return {
    id: String(r.id),
    wallet: String(r.wallet),
    name: String(r.name),
    prefix: String(r.prefix),
    created_at: iso(r.created_at)!,
    last_used_at: iso(r.last_used_at),
    revoked_at: iso(r.revoked_at),
  };
}

function alertRow(r: Row): AlertRow {
  return {
    id: String(r.id),
    wallet: String(r.wallet),
    watchlist_id: (r.watchlist_id as string | null) ?? null,
    mint: String(r.mint),
    kind: String(r.kind),
    message: String(r.message),
    details: (r.details as Record<string, unknown> | null) ?? null,
    read_at: iso(r.read_at),
    created_at: iso(r.created_at)!,
  };
}

/** Repo backed by Neon serverless Postgres over HTTP (one round trip per query, ideal for Vercel functions). */
export function createNeonRepo(databaseUrl: string): Repo {
  const sql = neon(databaseUrl);

  return {
    kind: "neon",

    async getCachedScan(mint) {
      const rows = await sql`select report, explanation from scan_cache where mint = ${mint} and expires_at > now()`;
      if (!rows[0]) return null;
      return { report: rows[0].report as ScanReport, explanation: (rows[0].explanation as Explanation | null) ?? null };
    },
    async putCachedScan(mint, report, expiresAt) {
      await sql`
        insert into scan_cache (mint, report, explanation, expires_at, updated_at)
        values (${mint}, ${JSON.stringify(report)}::jsonb, null, ${expiresAt.toISOString()}, now())
        on conflict (mint) do update
          set report = excluded.report, explanation = null, expires_at = excluded.expires_at, updated_at = now()`;
    },
    async putExplanation(mint, generatedAt, explanation) {
      await sql`
        update scan_cache set explanation = ${JSON.stringify(explanation)}::jsonb
        where mint = ${mint} and report->>'generatedAt' = ${generatedAt}`;
    },

    async incrCounter(key, windowStart, expiresAt) {
      const rows = await sql`select incr_counter(${key}, ${windowStart.toISOString()}, ${expiresAt.toISOString()}) as count`;
      return num(rows[0].count);
    },
    async getCounter(key, windowStart) {
      const rows = await sql`select count from usage_counters where key = ${key} and window_start = ${windowStart.toISOString()}`;
      return rows[0] ? num(rows[0].count) : 0;
    },

    async recordScan(r) {
      await sql`
        insert into scans (mint, name, symbol, score, label, wallet, ip_hash, via)
        values (${r.mint}, ${r.name}, ${r.symbol}, ${r.score}, ${r.label}, ${r.wallet}, ${r.ip_hash}, ${r.via})`;
    },
    async recentScans(limit) {
      return (await sql`select * from recent_scans(${limit})`).map(scanRow);
    },
    async scanHistory(wallet, limit) {
      const rows = await sql`
        select mint, name, symbol, score, label, created_at from scans
        where wallet = ${wallet} order by created_at desc limit ${limit}`;
      return rows.map(scanRow);
    },
    async latestScanForMint(mint) {
      const rows = await sql`
        select mint, name, symbol, score, label, created_at from scans
        where mint = ${mint} order by created_at desc limit 1`;
      return rows[0] ? scanRow(rows[0]) : null;
    },
    async stats() {
      const rows = await sql`select scan_stats() as s`;
      const s = rows[0].s as Stats;
      return { total_scans: num(s.total_scans), flagged_today: num(s.flagged_today), scans_today: num(s.scans_today) };
    },

    async createNonce(nonce, wallet, message, expiresAt) {
      await sql`insert into auth_nonces (nonce, wallet, message, expires_at) values (${nonce}, ${wallet}, ${message}, ${expiresAt.toISOString()})`;
    },
    async consumeNonce(nonce, wallet) {
      // Single UPDATE ... WHERE used_at IS NULL: atomic, so a nonce can't be replayed.
      const rows = await sql`
        update auth_nonces set used_at = now()
        where nonce = ${nonce} and wallet = ${wallet} and used_at is null and expires_at > now()
        returning message`;
      return rows[0] ? String(rows[0].message) : null;
    },

    async upsertWallet(w) {
      await sql`
        insert into wallets (address, tier, balance, checked_at) values (${w.address}, ${w.tier}, ${w.balance}, ${w.checked_at})
        on conflict (address) do update set tier = excluded.tier, balance = excluded.balance, checked_at = excluded.checked_at`;
    },
    async getWallet(address) {
      const rows = await sql`select address, tier, balance, checked_at from wallets where address = ${address}`;
      const r = rows[0];
      return r ? ({ address: String(r.address), tier: num(r.tier), balance: num(r.balance), checked_at: iso(r.checked_at)! } satisfies WalletRow) : null;
    },

    async listWatchlists(wallet) {
      const lists = (await sql`select * from watchlists where wallet = ${wallet} order by created_at asc`).map(listRow);
      if (lists.length === 0) return [];
      const ids = lists.map((l) => l.id);
      const items = (await sql`select * from watchlist_items where watchlist_id = any(${ids}::uuid[]) order by created_at asc`).map(itemRow);
      return lists.map((l) => ({ ...l, items: items.filter((i) => i.watchlist_id === l.id) }));
    },
    async createWatchlist(wallet, name) {
      const rows = await sql`insert into watchlists (wallet, name) values (${wallet}, ${name}) returning *`;
      return { ...listRow(rows[0]), items: [] };
    },
    async updateWatchlist(id, wallet, patch) {
      const has = (k: keyof typeof patch) => k in patch;
      const rows = await sql`
        update watchlists set
          name = case when ${has("name")} then ${patch.name ?? null} else name end,
          alert_score_change = case when ${has("alert_score_change")} then ${patch.alert_score_change ?? null}::boolean else alert_score_change end,
          alert_authority = case when ${has("alert_authority")} then ${patch.alert_authority ?? null}::boolean else alert_authority end,
          alert_liquidity_drop_pct = case when ${has("alert_liquidity_drop_pct")} then ${patch.alert_liquidity_drop_pct ?? null}::smallint else alert_liquidity_drop_pct end,
          alert_holder_dump_pct = case when ${has("alert_holder_dump_pct")} then ${patch.alert_holder_dump_pct ?? null}::numeric else alert_holder_dump_pct end,
          webhook_url = case when ${has("webhook_url")} then ${patch.webhook_url ?? null} else webhook_url end
        where id = ${id} and wallet = ${wallet}
        returning id`;
      return rows.length > 0;
    },
    async deleteWatchlist(id, wallet) {
      const rows = await sql`delete from watchlists where id = ${id} and wallet = ${wallet} returning id`;
      return rows.length > 0;
    },
    async addWatchItem(watchlistId, wallet, item) {
      // Ownership check and insert in one statement.
      const rows = await sql`
        with owned as (select id from watchlists where id = ${watchlistId} and wallet = ${wallet})
        insert into watchlist_items (watchlist_id, mint, name, symbol, snapshot, checked_at)
        select id, ${item.mint}, ${item.name}, ${item.symbol}, ${item.snapshot ? JSON.stringify(item.snapshot) : null}::jsonb,
               ${item.snapshot ? new Date().toISOString() : null}::timestamptz
        from owned
        on conflict (watchlist_id, mint) do nothing
        returning id`;
      if (rows.length > 0) return true;
      const owned = await sql`select 1 from watchlists where id = ${watchlistId} and wallet = ${wallet}`;
      return owned.length > 0; // true = already present
    },
    async removeWatchItem(watchlistId, wallet, mint) {
      const owned = await sql`select 1 from watchlists where id = ${watchlistId} and wallet = ${wallet}`;
      if (owned.length === 0) return false;
      await sql`delete from watchlist_items where watchlist_id = ${watchlistId} and mint = ${mint}`;
      return true;
    },
    async updateWatchItem(itemId, snapshot, checkedAt) {
      await sql`update watchlist_items set snapshot = ${JSON.stringify(snapshot)}::jsonb, checked_at = ${checkedAt.toISOString()} where id = ${itemId}`;
    },
    async staleWatchItems(olderThan, limit) {
      const rows = await sql`
        select i.*, to_jsonb(w) as list
        from watchlist_items i join watchlists w on w.id = i.watchlist_id
        where i.checked_at is null or i.checked_at < ${olderThan.toISOString()}
        order by i.checked_at asc nulls first
        limit ${limit}`;
      return rows.map((r) => ({ ...itemRow(r), list: listRow(r.list as Row) }));
    },

    async createAlert(a) {
      await sql`
        insert into alerts (wallet, watchlist_id, mint, kind, message, details)
        values (${a.wallet}, ${a.watchlist_id}, ${a.mint}, ${a.kind}, ${a.message}, ${a.details ? JSON.stringify(a.details) : null}::jsonb)`;
    },
    async listAlerts(wallet, limit) {
      return (await sql`select * from alerts where wallet = ${wallet} order by created_at desc limit ${limit}`).map(alertRow);
    },
    async markAlertsRead(wallet) {
      await sql`update alerts set read_at = now() where wallet = ${wallet} and read_at is null`;
    },

    async createApiKey(wallet, name, prefix, keyHash) {
      const rows = await sql`
        insert into api_keys (wallet, name, prefix, key_hash) values (${wallet}, ${name}, ${prefix}, ${keyHash})
        returning id, wallet, name, prefix, created_at, last_used_at, revoked_at`;
      return keyRow(rows[0]);
    },
    async listApiKeys(wallet) {
      const rows = await sql`
        select id, wallet, name, prefix, created_at, last_used_at, revoked_at from api_keys
        where wallet = ${wallet} order by created_at desc`;
      return rows.map(keyRow);
    },
    async revokeApiKey(wallet, id) {
      const rows = await sql`update api_keys set revoked_at = now() where id = ${id} and wallet = ${wallet} and revoked_at is null returning id`;
      return rows.length > 0;
    },
    async findApiKey(keyHash) {
      const rows = await sql`select id, wallet, name, prefix, created_at, last_used_at, revoked_at from api_keys where key_hash = ${keyHash}`;
      return rows[0] ? keyRow(rows[0]) : null;
    },
    async touchApiKey(id) {
      await sql`update api_keys set last_used_at = now() where id = ${id}`;
    },

    async prune() {
      await sql`select prune_expired()`;
    },
  };
}
