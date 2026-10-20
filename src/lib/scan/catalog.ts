/**
 * Human-readable description of every check, used by /docs and the landing page.
 * tests/catalog.test.ts asserts ids and weights match the engine.
 */
import type { CheckCategory } from "./types";

export interface CatalogEntry {
  id: string;
  title: string;
  category: CheckCategory;
  weight: number;
  heuristic?: boolean;
  what: string;
  rules: { pass?: string; warn?: string; fail?: string; unknown?: string };
  floor?: string;
  sources: string[];
  limitations: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    id: "mint_authority",
    title: "Mint authority",
    category: "authorities",
    weight: 20,
    what: "Whether any account can still create new tokens.",
    rules: { pass: "Mint authority is null (revoked).", fail: "A mint authority is set." },
    floor: "A fail sets the score to at least 50 (HIGH).",
    sources: ["Solana RPC: getAccountInfo (jsonParsed) on the mint"],
    limitations: "Some legitimate tokens (stablecoins, wrapped assets) keep a mint authority by design.",
  },
  {
    id: "freeze_authority",
    title: "Freeze authority",
    category: "authorities",
    weight: 15,
    what: "Whether any account can freeze holders' token accounts.",
    rules: { pass: "Freeze authority is null.", fail: "A freeze authority is set." },
    floor: "A fail sets the score to at least 50 (HIGH).",
    sources: ["Solana RPC: getAccountInfo (jsonParsed) on the mint"],
    limitations: "Regulated stablecoins keep a freeze authority for compliance.",
  },
  {
    id: "token2022_extensions",
    title: "Token-2022 extensions",
    category: "token2022",
    weight: 15,
    what: "Token-2022 features that give the issuer control over holders' tokens.",
    rules: {
      pass: "Classic SPL Token, or only informational extensions (metadata, groups).",
      warn: "Transfer fee under 5% or adjustable, transfer-hook authority without a hook, mint close authority, scaled/interest-bearing balances, confidential transfers, unrecognized extensions.",
      fail: "Permanent delegate, active transfer hook, default-frozen accounts, non-transferable, pausable, or transfer fee ≥ 5%.",
    },
    floor: "Permanent delegate, active transfer hook, default-frozen, non-transferable or pausable sets the score to at least 75 (CRITICAL).",
    sources: ["Solana RPC: mint account extensions (jsonParsed)"],
    limitations: "A transfer hook's program is not analyzed; we flag that one exists.",
  },
  {
    id: "liquidity_depth",
    title: "Liquidity depth",
    category: "liquidity",
    weight: 12,
    what: "Total USD liquidity across all DEX pools that contain the token.",
    rules: {
      pass: "≥ $10K and (if under $100K) at least 2% of market cap.",
      warn: "$1K–$10K, or under $100K and < 2% of market cap.",
      fail: "No pools, or < $1K.",
    },
    floor: "A fail sets the score to at least 50 (HIGH).",
    sources: ["DexScreener: token-pairs (max 30 pools)"],
    limitations: "DexScreener returns at most 30 pools and may lag for brand-new pools.",
  },
  {
    id: "lp_status",
    title: "LP burned / locked",
    category: "liquidity",
    weight: 10,
    what: "Whether the largest pool's liquidity can be withdrawn by its creator.",
    rules: {
      pass: "≥ 95% of LP tokens burned (Raydium standard pools), or a pump.fun bonding curve.",
      warn: "50–95% burned.",
      fail: "< 50% burned.",
      unknown: "Concentrated-liquidity pools (Orca, Raydium CLMM, Meteora DLMM) and other DEXs where lock status isn't detectable.",
    },
    sources: ["Raydium API: pools/info/ids (burnPercent)", "DexScreener"],
    limitations: "Third-party lockers (e.g. vesting contracts) are not detected, so unburned LP may still be locked.",
  },
  {
    id: "holder_concentration",
    title: "Holder concentration",
    category: "holders",
    weight: 14,
    what: "Share of total supply held by the largest 1 / 10 / 20 holders.",
    rules: {
      pass: "Top 1 ≤ 10%, top 10 ≤ 30%, top 20 ≤ 60%.",
      warn: "Top 1 > 10%, top 10 > 30% or top 20 > 60%.",
      fail: "Top 1 > 20% or top 10 > 50%.",
    },
    sources: ["Solana RPC: getTokenLargestAccounts + getMultipleAccounts (owners)"],
    limitations:
      "Only the 20 largest token accounts are visible. Pool vaults and burn addresses are excluded and labeled; unidentified program-owned (PDA) accounts are still counted.",
  },
  {
    id: "funding_clusters",
    title: "Shared funding source",
    category: "wallets",
    weight: 8,
    heuristic: true,
    what: "Top-holder wallets whose first SOL came from the same wallet within 72 hours.",
    rules: {
      pass: "No cluster among profiled wallets (enough wallets traceable or long-lived).",
      warn: "2 wallets share a funder.",
      fail: "3+ wallets share a funder.",
      unknown: "Too few wallets could be traced.",
    },
    sources: ["Solana RPC: getSignaturesForAddress + getTransaction on up to 10 top wallets"],
    limitations: "Exchanges fund many unrelated users, which can look like a cluster. Wallets with 100+ transactions are not traced.",
  },
  {
    id: "fresh_wallets",
    title: "Fresh wallets",
    category: "wallets",
    weight: 5,
    heuristic: true,
    what: "Top-holder wallets whose first transaction was less than 7 days ago.",
    rules: { pass: "Fewer than the warn thresholds.", warn: "≥ 2 and ≥ 30% of profiled wallets.", fail: "≥ 3 and ≥ 50% of profiled wallets." },
    sources: ["Solana RPC: getSignaturesForAddress"],
    limitations: "New users legitimately create new wallets.",
  },
  {
    id: "dev_holdings",
    title: "Dev wallet holdings",
    category: "wallets",
    weight: 8,
    heuristic: true,
    what: "Balance held by likely developer wallets: mint/freeze/update authorities and recorded creators.",
    rules: { pass: "< 3% of supply.", warn: "3–10%.", fail: "≥ 10%.", unknown: "No developer wallet identifiable." },
    sources: ["Solana RPC", "Helius DAS / Metaplex metadata"],
    limitations: "A developer can move tokens to unlinked wallets; we only see the linked ones.",
  },
  {
    id: "token_age",
    title: "Token age",
    category: "market",
    weight: 4,
    what: "Time since the first DEX pool was created.",
    rules: { pass: "≥ 72 hours.", warn: "1–72 hours.", fail: "< 1 hour." },
    sources: ["DexScreener: pairCreatedAt"],
    limitations: "Uses first pool creation, not mint creation.",
  },
  {
    id: "market_activity",
    title: "Market cap & volume",
    category: "market",
    weight: 4,
    what: "Market cap and 24h trading volume.",
    rules: { pass: "Market cap ≥ $50K and 24h volume ≥ $1K.", warn: "Below either threshold." },
    sources: ["DexScreener"],
    limitations: "Wash trading can inflate volume.",
  },
  {
    id: "trade_balance",
    title: "Buy / sell balance",
    category: "market",
    weight: 6,
    what: "Ratio of buy to sell transactions over 24h across all pools.",
    rules: {
      pass: "Ratio between 0.2 and 5.",
      warn: "Ratio > 5 or < 0.2.",
      fail: "20+ trades with zero sells (honeypot signal).",
      unknown: "Fewer than 20 trades.",
    },
    floor: "Zero sells sets the score to at least 75 (CRITICAL).",
    sources: ["DexScreener: txns.h24"],
    limitations: "Counts transactions, not volume or unique traders.",
  },
  {
    id: "metadata_mutable",
    title: "Metadata mutability",
    category: "metadata",
    weight: 4,
    what: "Whether name, symbol and image can still be changed.",
    rules: { pass: "Immutable.", warn: "Mutable (update authority set)." },
    sources: ["Helius DAS getAsset, or Metaplex metadata account / Token-2022 inline metadata"],
    limitations: "Many legitimate projects keep metadata mutable.",
  },
  {
    id: "socials",
    title: "Website & socials",
    category: "metadata",
    weight: 2,
    what: "Whether the token lists a website or social links.",
    rules: { pass: "At least one link found.", warn: "None found." },
    sources: ["DexScreener token profile, off-chain metadata JSON"],
    limitations: "We only check that links exist, never that they are official or active.",
  },
];

export const TOTAL_WEIGHT = CATALOG.reduce((a, c) => a + c.weight, 0);
