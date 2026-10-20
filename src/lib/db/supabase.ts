import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AlertRow, ApiKeyRow, Repo, ScanRow, Stats, WalletRow, WatchItem, Watchlist } from "./types";
import type { Explanation, ScanReport } from "@/lib/scan/types";

const LIST_COLS =
  "id,wallet,name,alert_score_change,alert_authority,alert_liquidity_drop_pct,alert_holder_dump_pct,webhook_url,created_at";
const KEY_COLS = "id,wallet,name,prefix,created_at,last_used_at,revoked_at";

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`supabase ${what}: ${r.error.message}`);
  return r.data;
}

export function createSupabaseRepo(url: string, serviceKey: string): Repo {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function ownsList(id: string, wallet: string): Promise<boolean> {
    const r = await db.from("watchlists").select("id").eq("id", id).eq("wallet", wallet).maybeSingle();
    return Boolean(must(r, "ownsList"));
  }

  return {
    kind: "supabase",

    async getCachedScan(mint) {
      const r = await db
        .from("scan_cache")
        .select("report,explanation")
        .eq("mint", mint)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      const row = must(r, "getCachedScan") as { report: ScanReport; explanation: Explanation | null } | null;
      return row ?? null;
    },
    async putCachedScan(mint, report, expiresAt) {
      must(
        await db.from("scan_cache").upsert({
          mint,
          report,
          explanation: null,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }),
        "putCachedScan",
      );
    },
    async putExplanation(mint, generatedAt, explanation) {
      must(
        await db.from("scan_cache").update({ explanation }).eq("mint", mint).eq("report->>generatedAt", generatedAt),
        "putExplanation",
      );
    },

    async incrCounter(key, windowStart, expiresAt) {
      const r = await db.rpc("incr_counter", {
        p_key: key,
        p_window: windowStart.toISOString(),
        p_expires: expiresAt.toISOString(),
      });
      return Number(must(r, "incrCounter"));
    },
    async getCounter(key, windowStart) {
      const r = await db
        .from("usage_counters")
        .select("count")
        .eq("key", key)
        .eq("window_start", windowStart.toISOString())
        .maybeSingle();
      return (must(r, "getCounter") as { count: number } | null)?.count ?? 0;
    },

    async recordScan(row) {
      must(await db.from("scans").insert(row), "recordScan");
    },
    async recentScans(limit) {
      return must(await db.rpc("recent_scans", { p_limit: limit }), "recentScans") as ScanRow[];
    },
    async scanHistory(wallet, limit) {
      const r = await db
        .from("scans")
        .select("mint,name,symbol,score,label,created_at")
        .eq("wallet", wallet)
        .order("created_at", { ascending: false })
        .limit(limit);
      return must(r, "scanHistory") as ScanRow[];
    },
    async latestScanForMint(mint) {
      const r = await db
        .from("scans")
        .select("mint,name,symbol,score,label,created_at")
        .eq("mint", mint)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return must(r, "latestScanForMint") as ScanRow | null;
    },
    async stats() {
      return must(await db.rpc("scan_stats"), "stats") as Stats;
    },

    async createNonce(nonce, wallet, message, expiresAt) {
      must(await db.from("auth_nonces").insert({ nonce, wallet, message, expires_at: expiresAt.toISOString() }), "createNonce");
    },
    async consumeNonce(nonce, wallet) {
      // Single UPDATE ... WHERE used_at IS NULL: atomic, so a nonce can't be replayed.
      const r = await db
        .from("auth_nonces")
        .update({ used_at: new Date().toISOString() })
        .eq("nonce", nonce)
        .eq("wallet", wallet)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("message");
      const rows = must(r, "consumeNonce") as Array<{ message: string }>;
      return rows[0]?.message ?? null;
    },

    async upsertWallet(w) {
      must(await db.from("wallets").upsert(w), "upsertWallet");
    },
    async getWallet(address) {
      const r = await db.from("wallets").select("address,tier,balance,checked_at").eq("address", address).maybeSingle();
      const row = must(r, "getWallet") as WalletRow | null;
      return row ? { ...row, balance: Number(row.balance) } : null;
    },

    async listWatchlists(wallet) {
      const r = await db
        .from("watchlists")
        .select(`${LIST_COLS},items:watchlist_items(id,watchlist_id,mint,name,symbol,snapshot,checked_at,created_at)`)
        .eq("wallet", wallet)
        .order("created_at", { ascending: true });
      const rows = must(r, "listWatchlists") as Watchlist[];
      return rows.map((l) => ({
        ...l,
        alert_holder_dump_pct: Number(l.alert_holder_dump_pct),
        items: [...(l.items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }));
    },
    async createWatchlist(wallet, name) {
      const r = await db.from("watchlists").insert({ wallet, name }).select(LIST_COLS).single();
      return { ...(must(r, "createWatchlist") as Omit<Watchlist, "items">), items: [] };
    },
    async updateWatchlist(id, wallet, patch) {
      const r = await db.from("watchlists").update(patch).eq("id", id).eq("wallet", wallet).select("id");
      return (must(r, "updateWatchlist") as unknown[]).length > 0;
    },
    async deleteWatchlist(id, wallet) {
      const r = await db.from("watchlists").delete().eq("id", id).eq("wallet", wallet).select("id");
      return (must(r, "deleteWatchlist") as unknown[]).length > 0;
    },
    async addWatchItem(watchlistId, wallet, item) {
      if (!(await ownsList(watchlistId, wallet))) return false;
      must(
        await db.from("watchlist_items").upsert(
          {
            watchlist_id: watchlistId,
            ...item,
            checked_at: item.snapshot ? new Date().toISOString() : null,
          },
          { onConflict: "watchlist_id,mint", ignoreDuplicates: true },
        ),
        "addWatchItem",
      );
      return true;
    },
    async removeWatchItem(watchlistId, wallet, mint) {
      if (!(await ownsList(watchlistId, wallet))) return false;
      must(await db.from("watchlist_items").delete().eq("watchlist_id", watchlistId).eq("mint", mint), "removeWatchItem");
      return true;
    },
    async updateWatchItem(itemId, snapshot, checkedAt) {
      must(
        await db.from("watchlist_items").update({ snapshot, checked_at: checkedAt.toISOString() }).eq("id", itemId),
        "updateWatchItem",
      );
    },
    async staleWatchItems(olderThan, limit) {
      const r = await db
        .from("watchlist_items")
        .select(`id,watchlist_id,mint,name,symbol,snapshot,checked_at,created_at,list:watchlists!inner(${LIST_COLS})`)
        .or(`checked_at.is.null,checked_at.lt.${olderThan.toISOString()}`)
        .order("checked_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      return must(r, "staleWatchItems") as unknown as Array<WatchItem & { list: Omit<Watchlist, "items"> }>;
    },

    async createAlert(a) {
      must(await db.from("alerts").insert(a), "createAlert");
    },
    async listAlerts(wallet, limit) {
      const r = await db.from("alerts").select("*").eq("wallet", wallet).order("created_at", { ascending: false }).limit(limit);
      return must(r, "listAlerts") as AlertRow[];
    },
    async markAlertsRead(wallet) {
      must(
        await db.from("alerts").update({ read_at: new Date().toISOString() }).eq("wallet", wallet).is("read_at", null),
        "markAlertsRead",
      );
    },

    async createApiKey(wallet, name, prefix, keyHash) {
      const r = await db.from("api_keys").insert({ wallet, name, prefix, key_hash: keyHash }).select(KEY_COLS).single();
      return must(r, "createApiKey") as ApiKeyRow;
    },
    async listApiKeys(wallet) {
      const r = await db.from("api_keys").select(KEY_COLS).eq("wallet", wallet).order("created_at", { ascending: false });
      return must(r, "listApiKeys") as ApiKeyRow[];
    },
    async revokeApiKey(wallet, id) {
      const r = await db
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("wallet", wallet)
        .is("revoked_at", null)
        .select("id");
      return (must(r, "revokeApiKey") as unknown[]).length > 0;
    },
    async findApiKey(keyHash) {
      const r = await db.from("api_keys").select(KEY_COLS).eq("key_hash", keyHash).maybeSingle();
      return must(r, "findApiKey") as ApiKeyRow | null;
    },
    async touchApiKey(id) {
      must(await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", id), "touchApiKey");
    },

    async prune() {
      must(await db.rpc("prune_expired"), "prune");
    },
  };
}
