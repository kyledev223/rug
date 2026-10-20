import type { Explanation, RiskLabel, ScanReport } from "@/lib/scan/types";

export interface ScanRow {
  mint: string;
  name: string | null;
  symbol: string | null;
  score: number;
  label: RiskLabel;
  created_at: string;
}

export interface Stats {
  total_scans: number;
  flagged_today: number;
  scans_today: number;
}

/** Fields compared between runs to raise watchlist alerts. */
export interface WatchSnapshot {
  score: number;
  label: RiskLabel;
  liquidityUsd: number | null;
  mintAuthority: boolean | null;
  freezeAuthority: boolean | null;
  /** Largest counted holders (pools/burn excluded); null when holder data was unavailable. */
  topHolders: Array<{ owner: string; pct: number }> | null;
  generatedAt: string;
}

export interface WatchItem {
  id: string;
  watchlist_id: string;
  mint: string;
  name: string | null;
  symbol: string | null;
  snapshot: WatchSnapshot | null;
  checked_at: string | null;
  created_at: string;
}

export interface Watchlist {
  id: string;
  wallet: string;
  name: string;
  alert_score_change: boolean;
  alert_authority: boolean;
  alert_liquidity_drop_pct: number;
  alert_holder_dump_pct: number;
  webhook_url: string | null;
  created_at: string;
  items: WatchItem[];
}

export type WatchlistPatch = Partial<
  Pick<
    Watchlist,
    "name" | "alert_score_change" | "alert_authority" | "alert_liquidity_drop_pct" | "alert_holder_dump_pct" | "webhook_url"
  >
>;

export interface AlertRow {
  id: string;
  wallet: string;
  watchlist_id: string | null;
  mint: string;
  kind: string;
  message: string;
  details: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  wallet: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface WalletRow {
  address: string;
  tier: number;
  balance: number;
  checked_at: string;
}

export interface Repo {
  readonly kind: "supabase" | "memory";

  getCachedScan(mint: string): Promise<{ report: ScanReport; explanation: Explanation | null } | null>;
  putCachedScan(mint: string, report: ScanReport, expiresAt: Date): Promise<void>;
  putExplanation(mint: string, reportGeneratedAt: string, explanation: Explanation): Promise<void>;

  incrCounter(key: string, windowStart: Date, expiresAt: Date): Promise<number>;
  getCounter(key: string, windowStart: Date): Promise<number>;

  recordScan(row: {
    mint: string;
    name: string | null;
    symbol: string | null;
    score: number;
    label: RiskLabel;
    wallet: string | null;
    ip_hash: string | null;
    via: "web" | "bulk" | "api" | "alert";
  }): Promise<void>;
  recentScans(limit: number): Promise<ScanRow[]>;
  scanHistory(wallet: string, limit: number): Promise<ScanRow[]>;
  latestScanForMint(mint: string): Promise<ScanRow | null>;
  stats(): Promise<Stats>;

  createNonce(nonce: string, wallet: string, message: string, expiresAt: Date): Promise<void>;
  /** Atomically marks the nonce used; returns its message only if valid, unused and unexpired. */
  consumeNonce(nonce: string, wallet: string): Promise<string | null>;

  upsertWallet(w: WalletRow): Promise<void>;
  getWallet(address: string): Promise<WalletRow | null>;

  listWatchlists(wallet: string): Promise<Watchlist[]>;
  createWatchlist(wallet: string, name: string): Promise<Watchlist>;
  updateWatchlist(id: string, wallet: string, patch: WatchlistPatch): Promise<boolean>;
  deleteWatchlist(id: string, wallet: string): Promise<boolean>;
  addWatchItem(watchlistId: string, wallet: string, item: { mint: string; name: string | null; symbol: string | null; snapshot: WatchSnapshot | null }): Promise<boolean>;
  removeWatchItem(watchlistId: string, wallet: string, mint: string): Promise<boolean>;
  updateWatchItem(itemId: string, snapshot: WatchSnapshot, checkedAt: Date): Promise<void>;
  /** Items least recently checked first, with their list settings and owner. */
  staleWatchItems(olderThan: Date, limit: number): Promise<Array<WatchItem & { list: Omit<Watchlist, "items"> }>>;

  createAlert(a: Omit<AlertRow, "id" | "read_at" | "created_at">): Promise<void>;
  listAlerts(wallet: string, limit: number): Promise<AlertRow[]>;
  markAlertsRead(wallet: string): Promise<void>;

  createApiKey(wallet: string, name: string, prefix: string, keyHash: string): Promise<ApiKeyRow>;
  listApiKeys(wallet: string): Promise<ApiKeyRow[]>;
  revokeApiKey(wallet: string, id: string): Promise<boolean>;
  findApiKey(keyHash: string): Promise<ApiKeyRow | null>;
  touchApiKey(id: string): Promise<void>;

  prune(): Promise<void>;
}
