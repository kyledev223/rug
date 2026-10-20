/**
 * In-memory Repo for local development without Supabase.
 * Not shared between serverless instances — never rely on it in production.
 */
import { randomUUID } from "node:crypto";
import type { AlertRow, ApiKeyRow, Repo, ScanRow, WalletRow, WatchItem, Watchlist } from "./types";
import type { Explanation, ScanReport } from "@/lib/scan/types";

interface ScanLog extends ScanRow {
  wallet: string | null;
  via: string;
}

export function createMemoryRepo(): Repo {
  const cache = new Map<string, { report: ScanReport; explanation: Explanation | null; expiresAt: number }>();
  const counters = new Map<string, { count: number; expiresAt: number }>();
  const scans: ScanLog[] = [];
  const nonces = new Map<string, { wallet: string; message: string; expiresAt: number; used: boolean }>();
  const wallets = new Map<string, WalletRow>();
  const lists = new Map<string, Watchlist>();
  const alerts: AlertRow[] = [];
  const keys = new Map<string, ApiKeyRow & { hash: string }>();
  const now = () => Date.now();
  const iso = () => new Date().toISOString();
  const strip = ({ hash, ...k }: ApiKeyRow & { hash: string }): ApiKeyRow => (void hash, k);

  return {
    kind: "memory",

    async getCachedScan(mint) {
      const c = cache.get(mint);
      if (!c || c.expiresAt < now()) return null;
      return { report: c.report, explanation: c.explanation };
    },
    async putCachedScan(mint, report, expiresAt) {
      cache.set(mint, { report, explanation: null, expiresAt: expiresAt.getTime() });
    },
    async putExplanation(mint, generatedAt, explanation) {
      const c = cache.get(mint);
      if (c && c.report.generatedAt === generatedAt) c.explanation = explanation;
    },

    async incrCounter(key, windowStart, expiresAt) {
      const k = `${key}|${windowStart.toISOString()}`;
      const c = counters.get(k);
      if (!c || c.expiresAt < now()) {
        counters.set(k, { count: 1, expiresAt: expiresAt.getTime() });
        return 1;
      }
      c.count++;
      return c.count;
    },
    async getCounter(key, windowStart) {
      const c = counters.get(`${key}|${windowStart.toISOString()}`);
      return c && c.expiresAt >= now() ? c.count : 0;
    },

    async recordScan(row) {
      scans.push({ ...row, created_at: iso() });
      if (scans.length > 5000) scans.splice(0, scans.length - 5000);
    },
    async recentScans(limit) {
      const seen = new Set<string>();
      const out: ScanRow[] = [];
      for (let i = scans.length - 1; i >= 0 && out.length < limit; i--) {
        const s = scans[i];
        if (s.via === "alert" || seen.has(s.mint)) continue;
        seen.add(s.mint);
        out.push({ mint: s.mint, name: s.name, symbol: s.symbol, score: s.score, label: s.label, created_at: s.created_at });
      }
      return out;
    },
    async scanHistory(wallet, limit) {
      return scans.filter((s) => s.wallet === wallet).slice(-limit).reverse();
    },
    async latestScanForMint(mint) {
      for (let i = scans.length - 1; i >= 0; i--) if (scans[i].mint === mint) return scans[i];
      return null;
    },
    async stats() {
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const today = scans.filter((s) => new Date(s.created_at) >= day);
      return {
        total_scans: scans.length,
        scans_today: today.length,
        flagged_today: new Set(today.filter((s) => s.score >= 50).map((s) => s.mint)).size,
      };
    },

    async createNonce(nonce, wallet, message, expiresAt) {
      nonces.set(nonce, { wallet, message, expiresAt: expiresAt.getTime(), used: false });
    },
    async consumeNonce(nonce, wallet) {
      const n = nonces.get(nonce);
      if (!n || n.used || n.wallet !== wallet || n.expiresAt < now()) return null;
      n.used = true;
      return n.message;
    },

    async upsertWallet(w) {
      wallets.set(w.address, w);
    },
    async getWallet(address) {
      return wallets.get(address) ?? null;
    },

    async listWatchlists(wallet) {
      return [...lists.values()].filter((l) => l.wallet === wallet).map((l) => ({ ...l, items: [...l.items] }));
    },
    async createWatchlist(wallet, name) {
      const l: Watchlist = {
        id: randomUUID(),
        wallet,
        name,
        alert_score_change: true,
        alert_authority: true,
        alert_liquidity_drop_pct: 30,
        alert_holder_dump_pct: 5,
        webhook_url: null,
        created_at: iso(),
        items: [],
      };
      lists.set(l.id, l);
      return { ...l, items: [] };
    },
    async updateWatchlist(id, wallet, patch) {
      const l = lists.get(id);
      if (!l || l.wallet !== wallet) return false;
      Object.assign(l, patch);
      return true;
    },
    async deleteWatchlist(id, wallet) {
      const l = lists.get(id);
      if (!l || l.wallet !== wallet) return false;
      lists.delete(id);
      return true;
    },
    async addWatchItem(watchlistId, wallet, item) {
      const l = lists.get(watchlistId);
      if (!l || l.wallet !== wallet) return false;
      if (l.items.some((i) => i.mint === item.mint)) return true;
      const wi: WatchItem = {
        id: randomUUID(),
        watchlist_id: watchlistId,
        ...item,
        checked_at: item.snapshot ? iso() : null,
        created_at: iso(),
      };
      l.items.push(wi);
      return true;
    },
    async removeWatchItem(watchlistId, wallet, mint) {
      const l = lists.get(watchlistId);
      if (!l || l.wallet !== wallet) return false;
      l.items = l.items.filter((i) => i.mint !== mint);
      return true;
    },
    async updateWatchItem(itemId, snapshot, checkedAt) {
      for (const l of lists.values()) {
        const it = l.items.find((i) => i.id === itemId);
        if (it) {
          it.snapshot = snapshot;
          it.checked_at = checkedAt.toISOString();
        }
      }
    },
    async staleWatchItems(olderThan, limit) {
      const out: Array<WatchItem & { list: Omit<Watchlist, "items"> }> = [];
      for (const l of lists.values()) {
        const { items, ...list } = l;
        for (const it of items) {
          if (!it.checked_at || new Date(it.checked_at) < olderThan) out.push({ ...it, list });
        }
      }
      return out.sort((a, b) => (a.checked_at ?? "").localeCompare(b.checked_at ?? "")).slice(0, limit);
    },

    async createAlert(a) {
      alerts.push({ ...a, id: randomUUID(), read_at: null, created_at: iso() });
    },
    async listAlerts(wallet, limit) {
      return alerts.filter((a) => a.wallet === wallet).slice(-limit).reverse();
    },
    async markAlertsRead(wallet) {
      for (const a of alerts) if (a.wallet === wallet && !a.read_at) a.read_at = iso();
    },

    async createApiKey(wallet, name, prefix, keyHash) {
      const k = { id: randomUUID(), wallet, name, prefix, hash: keyHash, created_at: iso(), last_used_at: null, revoked_at: null };
      keys.set(k.id, k);
      return strip(k);
    },
    async listApiKeys(wallet) {
      return [...keys.values()].filter((k) => k.wallet === wallet).map(strip);
    },
    async revokeApiKey(wallet, id) {
      const k = keys.get(id);
      if (!k || k.wallet !== wallet) return false;
      k.revoked_at = iso();
      return true;
    },
    async findApiKey(keyHash) {
      for (const k of keys.values()) if (k.hash === keyHash) return strip(k);
      return null;
    },
    async touchApiKey(id) {
      const k = keys.get(id);
      if (k) k.last_used_at = iso();
    },

    async prune() {
      for (const [k, v] of counters) if (v.expiresAt < now()) counters.delete(k);
      for (const [k, v] of cache) if (v.expiresAt < now()) cache.delete(k);
    },
  };
}
