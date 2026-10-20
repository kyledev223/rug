/**
 * Fixture snapshots for the scoring engine. Addresses are syntactically valid
 * but the data is hand-written to represent a known-good and a known-bad profile.
 */
import type { Fetched, TokenSnapshot, WalletProfile } from "@/lib/scan/snapshot";
import type { SourceName } from "@/lib/scan/types";

export const NOW = Date.parse("2026-10-01T12:00:00Z");
const AT = new Date(NOW).toISOString();
const H = 3600_000;
const D = 24 * H;

export function ok<T>(source: SourceName, data: T): Fetched<T> {
  return { ok: true, data, source, at: AT };
}
export function err<T>(source: SourceName, error = "HTTP 503"): Fetched<T> {
  return { ok: false, error, source, at: AT };
}

// Real-format base58 keys used purely as identifiers.
export const A = {
  goodMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  badMint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  pool1: "5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9",
  pool2: "HVNwzt7Pxfu76KHCMQPTLuTCLTm6WnQ1esLv4eizseSv",
  rayAuth: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  burn: "1nc1nerator11111111111111111111111111111111",
  dev: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  funder: "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S",
  w: [
    "8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC",
    "3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E",
    "GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ",
    "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    "CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq",
    "6dhxiTFXDcvsjHVJRmWQ5mZeoE3CAHfd5yzYTpzWa4Wd",
    "BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3iBBBDiq4",
    "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B",
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  ],
};

function profile(owner: string, p: Partial<WalletProfile> = {}): WalletProfile {
  return {
    owner,
    reachedOldest: false,
    txCount: 100,
    firstSeen: null,
    firstSig: null,
    funder: null,
    fundedAt: null,
    fundingSig: null,
    ...p,
  };
}

/** Established token: authorities revoked, deep burned liquidity, distributed holders. */
export function goodSnapshot(): TokenSnapshot {
  const supply = 1_000_000_000;
  return {
    mint: A.goodMint,
    now: NOW,
    mintInfo: ok("Solana RPC", {
      program: "spl-token",
      decimals: 6,
      supply,
      mintAuthority: null,
      freezeAuthority: null,
      extensions: [],
    }),
    metadata: ok("Helius DAS", {
      name: "Good Token",
      symbol: "GOOD",
      image: null,
      mutable: false,
      updateAuthority: null,
      creators: [A.dev],
      socials: { website: "https://good.example", twitter: "https://x.com/good", telegram: null, other: [] },
      socialsSource: "DexScreener",
    }),
    pairs: ok("DexScreener", [
      {
        pairAddress: A.pool2,
        dexId: "raydium",
        labels: [],
        quoteSymbol: "SOL",
        url: "https://dexscreener.com/solana/x",
        liquidityUsd: 900_000,
        createdAt: NOW - 400 * D,
        priceUsd: 0.01,
        marketCap: 10_000_000,
        fdv: 10_000_000,
        volume24h: 1_200_000,
        buys24h: 5200,
        sells24h: 4800,
      },
      {
        pairAddress: A.pool1,
        dexId: "orca",
        labels: ["wp"],
        quoteSymbol: "USDC",
        url: "https://dexscreener.com/solana/y",
        liquidityUsd: 300_000,
        createdAt: NOW - 300 * D,
        priceUsd: 0.01,
        marketCap: 10_000_000,
        fdv: 10_000_000,
        volume24h: 300_000,
        buys24h: 1000,
        sells24h: 1100,
      },
    ]),
    lp: ok("Raydium API", [{ pairAddress: A.pool2, fungibleLp: true, burnPercent: 100, lpMint: A.w[9] }]),
    largest: ok("Solana RPC", [
      { tokenAccount: A.w[0], owner: A.rayAuth, ownerOnCurve: false, amount: 90_000_000 }, // pool, excluded
      { tokenAccount: A.w[1], owner: A.burn, ownerOnCurve: false, amount: 50_000_000 }, // burn, excluded
      { tokenAccount: A.w[2], owner: A.pool1, ownerOnCurve: false, amount: 30_000_000 }, // orca pool, excluded
      ...A.w.map((w, i) => ({ tokenAccount: `${w.slice(0, -1)}${i}`, owner: w, ownerOnCurve: true, amount: 20_000_000 - i * 1_000_000 })),
    ]),
    wallets: ok(
      "Solana RPC",
      A.w.map((w) => profile(w)),
    ),
    dev: ok("Solana RPC", [{ address: A.dev, role: "Creator", amount: 5_000_000 }]),
  };
}

/** Classic rug profile: every red flag at once. */
export function badSnapshot(): TokenSnapshot {
  const supply = 1_000_000_000;
  const fundedAt = NOW - 2 * H;
  return {
    mint: A.badMint,
    now: NOW,
    mintInfo: ok("Solana RPC", {
      program: "spl-token-2022",
      decimals: 6,
      supply,
      mintAuthority: A.dev,
      freezeAuthority: A.dev,
      extensions: [
        { extension: "permanentDelegate", state: { delegate: A.dev } },
        {
          extension: "transferFeeConfig",
          state: {
            newerTransferFee: { epoch: 1, maximumFee: 0, transferFeeBasisPoints: 1000 },
            olderTransferFee: { epoch: 1, maximumFee: 0, transferFeeBasisPoints: 1000 },
            transferFeeConfigAuthority: A.dev,
          },
        },
        { extension: "metadataPointer", state: {} },
      ],
    }),
    metadata: ok("Helius DAS", {
      name: "Totally Real",
      symbol: "RUG",
      image: null,
      mutable: true,
      updateAuthority: A.dev,
      creators: [A.dev],
      socials: { website: null, twitter: null, telegram: null, other: [] },
      socialsSource: "Helius DAS",
    }),
    pairs: ok("DexScreener", [
      {
        pairAddress: A.pool2,
        dexId: "raydium",
        labels: [],
        quoteSymbol: "SOL",
        url: "https://dexscreener.com/solana/z",
        liquidityUsd: 800,
        createdAt: NOW - 30 * 60_000,
        priceUsd: 0.00001,
        marketCap: 9_000,
        fdv: 9_000,
        volume24h: 400,
        buys24h: 120,
        sells24h: 0,
      },
    ]),
    lp: ok("Raydium API", [{ pairAddress: A.pool2, fungibleLp: true, burnPercent: 0, lpMint: A.w[9] }]),
    largest: ok("Solana RPC", [
      { tokenAccount: A.w[9], owner: A.dev, ownerOnCurve: true, amount: 400_000_000 },
      ...A.w.slice(0, 6).map((w, i) => ({ tokenAccount: `${w.slice(0, -1)}${i}`, owner: w, ownerOnCurve: true, amount: 50_000_000 })),
    ]),
    wallets: ok("Solana RPC", [
      profile(A.dev, { reachedOldest: true, txCount: 6, firstSeen: NOW - 3 * H, funder: A.funder, fundedAt: NOW - 3 * H, fundingSig: "sigdev" }),
      ...A.w.slice(0, 6).map((w, i) =>
        profile(w, {
          reachedOldest: true,
          txCount: 3,
          firstSeen: fundedAt + i * 60_000,
          firstSig: `sig${i}`,
          funder: i < 4 ? A.funder : null,
          fundedAt: i < 4 ? fundedAt + i * 60_000 : null,
          fundingSig: i < 4 ? `sig${i}` : null,
        }),
      ),
    ]),
    dev: ok("Solana RPC", [{ address: A.dev, role: "Mint authority", amount: 400_000_000 }]),
  };
}

/** Mint loads but every other source is down. */
export function outageSnapshot(): TokenSnapshot {
  const g = goodSnapshot();
  return {
    ...g,
    metadata: err("Helius DAS"),
    pairs: err("DexScreener"),
    lp: err("Raydium API"),
    largest: err("Solana RPC", "rate limited"),
    wallets: err("Solana RPC", "rate limited"),
    dev: err("Solana RPC", "rate limited"),
  };
}
