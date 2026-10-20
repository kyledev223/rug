/** DexScreener public API — pools, liquidity, volume, txn counts. No key needed. */

const BASE = "https://api.dexscreener.com";

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  txns?: { h24?: { buys: number; sells: number } };
  volume?: { h24?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{ url: string; label?: string }>;
    socials?: Array<{ url: string; type: string }>;
  };
}

/** All Solana pairs that include `mint` (DexScreener returns at most 30). */
export async function getTokenPairs(mint: string): Promise<DexPair[]> {
  const res = await fetch(`${BASE}/token-pairs/v1/solana/${mint}`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const data = (await res.json()) as DexPair[] | null;
  return Array.isArray(data) ? data.filter((p) => p.chainId === "solana") : [];
}
