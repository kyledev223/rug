/**
 * A TokenSnapshot holds normalized facts gathered from all data sources.
 * Checks are pure functions of a snapshot, which keeps them unit-testable
 * with fixtures and independent of any particular provider.
 */
import type { SourceName } from "./types";

export type Fetched<T> =
  | { ok: true; data: T; source: SourceName; at: string }
  | { ok: false; error: string; source: SourceName; at: string };

export interface MintFacts {
  program: "spl-token" | "spl-token-2022";
  decimals: number;
  supply: number; // UI units
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: Array<{ extension: string; state?: Record<string, unknown> }>;
  /** Token-2022 inline metadata, if present. */
  inlineMetadata?: { name: string; symbol: string; uri: string; updateAuthority: string | null };
}

export interface MetadataFacts {
  name: string | null;
  symbol: string | null;
  image: string | null;
  /** null when it couldn't be determined. */
  mutable: boolean | null;
  updateAuthority: string | null;
  creators: string[];
  socials: { website: string | null; twitter: string | null; telegram: string | null; other: string[] };
  /** Where socials came from, for evidence. */
  socialsSource: SourceName;
}

export interface PairFacts {
  pairAddress: string;
  dexId: string;
  labels: string[];
  quoteSymbol: string;
  url: string;
  liquidityUsd: number | null;
  createdAt: number | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
}

export interface LpFacts {
  pairAddress: string;
  /** Raydium "Standard" pools have fungible LP tokens whose burn % is meaningful. */
  fungibleLp: boolean;
  burnPercent: number | null;
  lpMint: string | null;
}

export interface LargestAccountFacts {
  tokenAccount: string;
  owner: string | null;
  ownerOnCurve: boolean | null;
  amount: number; // UI units
}

export interface WalletProfile {
  owner: string;
  /** True when the full signature history fit in one page, so `firstSeen` is the true first tx. */
  reachedOldest: boolean;
  txCount: number;
  firstSeen: number | null; // ms epoch
  firstSig: string | null;
  funder: string | null;
  fundedAt: number | null;
  fundingSig: string | null;
}

export interface DevHolding {
  address: string;
  role: string;
  amount: number;
}

export interface TokenSnapshot {
  mint: string;
  now: number; // ms epoch used for age calculations
  mintInfo: Fetched<MintFacts>;
  metadata: Fetched<MetadataFacts>;
  pairs: Fetched<PairFacts[]>;
  lp: Fetched<LpFacts[]>;
  largest: Fetched<LargestAccountFacts[]>;
  wallets: Fetched<WalletProfile[]>;
  dev: Fetched<DevHolding[]>;
}
