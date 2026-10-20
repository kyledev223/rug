export type CheckStatus = "pass" | "warn" | "fail" | "unknown";
export type RiskLabel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SourceName = "Solana RPC" | "Helius DAS" | "DexScreener" | "Raydium API";

export type CheckCategory =
  | "authorities"
  | "token2022"
  | "liquidity"
  | "holders"
  | "wallets"
  | "market"
  | "metadata";

export interface Evidence {
  label: string;
  value: string;
  /** Solana account involved; rendered as a Solscan link. */
  account?: string;
  /** Transaction signature; rendered as a Solscan link. */
  tx?: string;
  source: SourceName;
  observedAt: string; // ISO timestamp of the fetch that produced the value
}

export interface CheckResult {
  id: string;
  title: string;
  category: CheckCategory;
  status: CheckStatus;
  weight: number;
  /** One-line deterministic finding, e.g. "Mint authority is still active". */
  summary: string;
  evidence: Evidence[];
  /** Minimum overall score when this check fails (hard red flags). */
  floor?: number;
  heuristic?: boolean;
}

export type HolderKind = "wallet" | "pool" | "burn" | "program" | "pda";

export interface HolderRow {
  tokenAccount: string;
  owner: string | null;
  amount: number; // UI units
  pct: number; // share of total supply, 0-100
  kind: HolderKind;
  label?: string;
  /** Counted toward whale/concentration metrics. */
  counted: boolean;
}

export interface PoolInfo {
  pairAddress: string;
  dexId: string;
  labels: string[];
  quoteSymbol: string;
  liquidityUsd: number | null;
  createdAt: number | null; // ms epoch
  url: string;
  lp?: {
    status: "burned" | "partial" | "unburned" | "bonding-curve" | "unknown";
    burnPercent?: number;
    lpMint?: string;
    note: string;
  };
}

export interface SourceStatus {
  name: SourceName;
  ok: boolean;
  fetchedAt: string;
  error?: string;
}

export interface ScanReport {
  version: string;
  mint: string;
  generatedAt: string;
  token: {
    name: string | null;
    symbol: string | null;
    image: string | null;
    decimals: number;
    supply: number; // UI units
    program: "spl-token" | "spl-token-2022";
  };
  score: number;
  label: RiskLabel;
  /** Share of total check weight with a known (non-unknown) result, 0-100. */
  coverage: number;
  checks: CheckResult[];
  holders: HolderRow[];
  pools: PoolInfo[];
  market: {
    priceUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    volume24hUsd: number | null;
    buys24h: number | null;
    sells24h: number | null;
    liquidityUsd: number | null;
    createdAt: number | null;
  };
  sources: SourceStatus[];
}

export interface Explanation {
  source: "ai" | "template";
  model?: string;
  overview: string;
  checks: Record<string, string>;
  generatedAt: string;
}
