/**
 * App-wide configuration. Safe to import from client and server code.
 * Rename the app, set the token mint and tune tiers here.
 */

export const APP_NAME = "RUG CHECK";
export const APP_SHORT = "rugcheck";
export const TOKEN_TICKER = "$RUGCHECK";
export const APP_TAGLINE = "Solana token risk scanner";

/**
 * Mint address of the holder token. Leave null until launch:
 * the token section stays hidden and nobody qualifies for a holder tier.
 * NEXT_PUBLIC_TOKEN_MINT overrides this without a code change.
 */
export const TOKEN_MINT: string | null =
  process.env.NEXT_PUBLIC_TOKEN_MINT?.trim() || null;

export const DISCLAIMER =
  "Automated risk signals, not financial advice. A low score does not mean a token is safe.";

export type TierId = 0 | 1 | 2 | 3;

export interface TierDef {
  id: TierId;
  name: string;
  /** Minimum token balance (UI units, not raw base units). */
  minBalance: number;
  /** Single scans per UTC day. null = unlimited. */
  dailyScans: number | null;
  history: boolean;
  watchlists: number;
  watchlistSize: number;
  bulk: boolean;
  bulkMax: number;
  alerts: boolean;
  apiKey: boolean;
  perks: string[];
}

/** Edit thresholds here. minBalance is in whole tokens. */
export const TIERS: TierDef[] = [
  {
    id: 0,
    name: "Free",
    minBalance: 0,
    dailyScans: 5,
    history: false,
    watchlists: 0,
    watchlistSize: 0,
    bulk: false,
    bulkMax: 0,
    alerts: false,
    apiKey: false,
    perks: ["5 scans / day per IP", "Full risk report", "Shareable report links"],
  },
  {
    id: 1,
    name: "Holder I",
    minBalance: 100_000,
    dailyScans: 50,
    history: true,
    watchlists: 1,
    watchlistSize: 10,
    bulk: false,
    bulkMax: 0,
    alerts: false,
    apiKey: false,
    perks: ["50 scans / day", "Scan history", "1 watchlist (10 tokens)"],
  },
  {
    id: 2,
    name: "Holder II",
    minBalance: 1_000_000,
    dailyScans: null,
    history: true,
    watchlists: 5,
    watchlistSize: 25,
    bulk: true,
    bulkMax: 25,
    alerts: true,
    apiKey: false,
    perks: [
      "Unlimited single scans",
      "Bulk scan (25 mints) + CSV export",
      "5 watchlists",
      "Risk-change alerts",
    ],
  },
  {
    id: 3,
    name: "Holder III",
    minBalance: 5_000_000,
    dailyScans: null,
    history: true,
    watchlists: 5,
    watchlistSize: 25,
    bulk: true,
    bulkMax: 25,
    alerts: true,
    apiKey: true,
    perks: ["Everything in Holder II", "Personal API key", "Programmatic scans"],
  },
];

export function tierById(id: TierId): TierDef {
  return TIERS[id];
}

export function tierForBalance(balance: number): TierDef {
  let best = TIERS[0];
  for (const t of TIERS) if (balance >= t.minBalance) best = t;
  return best;
}

/** How long a verified balance is trusted before re-checking on-chain. */
export const BALANCE_RECHECK_MS = 3 * 60 * 60 * 1000;
/** Scan results are cached per mint for this long. */
export const SCAN_CACHE_TTL_MS = 5 * 60 * 1000;
/** Bump when check logic changes so stale cached reports are ignored. */
export const ENGINE_VERSION = "1.0.0";

export const LINKS = {
  solscanToken: (a: string) => `https://solscan.io/token/${a}`,
  solscanAccount: (a: string) => `https://solscan.io/account/${a}`,
  solscanTx: (s: string) => `https://solscan.io/tx/${s}`,
  dexscreener: (a: string) => `https://dexscreener.com/solana/${a}`,
};

/** Tier 3 API limits per key. */
export const API_LIMITS = { perMinute: 30, perDay: 2000 };
