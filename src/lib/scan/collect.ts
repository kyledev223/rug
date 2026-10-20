import "server-only";
/**
 * Gathers raw data from every source into a TokenSnapshot.
 * Each source failure is captured (never thrown) so checks can report "unknown".
 */
import type { SourceName } from "./types";
import type {
  DevHolding,
  Fetched,
  LargestAccountFacts,
  LpFacts,
  MetadataFacts,
  MintFacts,
  PairFacts,
  TokenSnapshot,
  WalletProfile,
} from "./snapshot";
import {
  getAccountInfoParsed,
  getMultipleAccountsParsed,
  getOwnerTokenBalance,
  getSignaturesForAddress,
  getTokenLargestAccounts,
  getTransactionParsed,
  type MintInfoRaw,
  type ParsedTransaction,
  type TokenAccountInfoRaw,
} from "@/lib/sources/rpc";
import { getTokenPairs, type DexPair } from "@/lib/sources/dexscreener";
import { getRaydiumPools } from "@/lib/sources/raydium";
import { dasAvailable, getAsset, getOffchainSocials } from "@/lib/sources/helius";
import { getMetaplexMetadata } from "@/lib/sources/metaplex";
import { KNOWN_OWNERS, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "@/lib/sources/known-accounts";
import { isOnCurve } from "@/lib/solana/curve";
import { logError } from "@/lib/log";

export class ScanInputError extends Error {
  constructor(
    message: string,
    public status: 400 | 404,
  ) {
    super(message);
    this.name = "ScanInputError";
  }
}

const SIG_PAGE = 100;
const PROFILE_WALLETS = 10;

async function settle<T>(source: SourceName, fn: () => Promise<T>): Promise<Fetched<T>> {
  try {
    const data = await fn();
    return { ok: true, data, source, at: new Date().toISOString() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logError(`source:${source}`, e);
    return { ok: false, error: error.slice(0, 200), source, at: new Date().toISOString() };
  }
}

function failed<T>(source: SourceName, error: string): Fetched<T> {
  return { ok: false, error, source, at: new Date().toISOString() };
}

/** Loads and validates the mint. Throws ScanInputError if it isn't an SPL/Token-2022 mint. */
async function loadMint(mint: string): Promise<Fetched<MintFacts>> {
  const acc = await getAccountInfoParsed<MintInfoRaw>(mint);
  if (!acc) throw new ScanInputError("No account exists at this address on Solana mainnet.", 404);
  if (acc.owner !== TOKEN_PROGRAM && acc.owner !== TOKEN_2022_PROGRAM) {
    throw new ScanInputError("This address is not an SPL token mint (it may be a wallet or program).", 400);
  }
  const d = acc.data;
  if (Array.isArray(d) || d.parsed.type !== "mint") {
    throw new ScanInputError("This address is a token account, not a token mint.", 400);
  }
  const info = d.parsed.info;
  const exts = info.extensions ?? [];
  const tm = exts.find((e) => e.extension === "tokenMetadata")?.state;
  return {
    ok: true,
    source: "Solana RPC",
    at: new Date().toISOString(),
    data: {
      program: acc.owner === TOKEN_2022_PROGRAM ? "spl-token-2022" : "spl-token",
      decimals: info.decimals,
      supply: Number(info.supply) / 10 ** info.decimals,
      mintAuthority: info.mintAuthority ?? null,
      freezeAuthority: info.freezeAuthority ?? null,
      extensions: exts,
      ...(tm
        ? {
            inlineMetadata: {
              name: String(tm.name ?? ""),
              symbol: String(tm.symbol ?? ""),
              uri: String(tm.uri ?? ""),
              updateAuthority: (tm.updateAuthority as string | null) ?? null,
            },
          }
        : {}),
    },
  };
}

function toPairFacts(p: DexPair): PairFacts {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const quote = p.baseToken.address === p.quoteToken.address ? p.baseToken : p.quoteToken;
  return {
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    labels: p.labels ?? [],
    quoteSymbol: quote.symbol,
    url: p.url,
    liquidityUsd: num(p.liquidity?.usd),
    createdAt: num(p.pairCreatedAt),
    priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
    marketCap: num(p.marketCap),
    fdv: num(p.fdv),
    volume24h: num(p.volume?.h24),
    buys24h: num(p.txns?.h24?.buys),
    sells24h: num(p.txns?.h24?.sells),
  };
}

async function loadMetadata(
  mint: string,
  mintFacts: MintFacts,
  dexPairs: DexPair[] | null,
): Promise<MetadataFacts & { _source: SourceName }> {
  let base: Omit<MetadataFacts, "socials" | "socialsSource">;
  let jsonUri: string | null = null;
  let source: SourceName;
  if (dasAvailable()) {
    const a = await getAsset(mint);
    source = "Helius DAS";
    jsonUri = a.jsonUri;
    base = {
      name: a.name,
      symbol: a.symbol,
      image: a.image,
      mutable: a.mutable,
      updateAuthority: a.updateAuthority,
      creators: a.creators,
    };
  } else {
    source = "Solana RPC";
    const mp = await getMetaplexMetadata(mint);
    const inline = mintFacts.inlineMetadata;
    if (mp) {
      jsonUri = mp.uri || null;
      base = {
        name: mp.name || null,
        symbol: mp.symbol || null,
        image: null,
        mutable: mp.isMutable,
        updateAuthority: mp.isMutable ? mp.updateAuthority : null,
        creators: mp.creators,
      };
    } else if (inline) {
      jsonUri = inline.uri || null;
      base = {
        name: inline.name || null,
        symbol: inline.symbol || null,
        image: null,
        mutable: inline.updateAuthority !== null,
        updateAuthority: inline.updateAuthority,
        creators: [],
      };
    } else {
      base = { name: null, symbol: null, image: null, mutable: null, updateAuthority: null, creators: [] };
    }
  }

  // Socials: DexScreener token profile first, then the off-chain metadata JSON.
  const info = dexPairs?.find((p) => p.info)?.info;
  const pairImage = dexPairs?.find((p) => p.info?.imageUrl)?.info?.imageUrl ?? null;
  if (info && ((info.socials?.length ?? 0) > 0 || (info.websites?.length ?? 0) > 0)) {
    const s = info.socials ?? [];
    const byType = (t: string) => s.find((x) => x.type === t)?.url ?? null;
    return {
      ...base,
      image: base.image ?? pairImage,
      socials: {
        website: info.websites?.[0]?.url ?? null,
        twitter: byType("twitter"),
        telegram: byType("telegram"),
        other: s.filter((x) => x.type !== "twitter" && x.type !== "telegram").map((x) => x.url),
      },
      socialsSource: "DexScreener",
      _source: source,
    };
  }
  let socials = { website: null as string | null, twitter: null as string | null, telegram: null as string | null };
  if (jsonUri) {
    socials = await getOffchainSocials(jsonUri).catch(() => socials);
  }
  return {
    ...base,
    image: base.image ?? pairImage,
    socials: { ...socials, other: [] },
    socialsSource: source,
    _source: source,
  };
}

export function findFunder(tx: ParsedTransaction, owner: string): string | null {
  const ixs = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions),
  ];
  for (const ix of ixs) {
    if (ix.programId !== SYSTEM_PROGRAM || !ix.parsed) continue;
    const { type, info } = ix.parsed;
    if ((type === "transfer" || type === "transferWithSeed") && info.destination === owner) return String(info.source);
    if ((type === "createAccount" || type === "createAccountWithSeed") && info.newAccount === owner)
      return String(info.source);
  }
  return null;
}

export async function profileWallet(owner: string): Promise<WalletProfile> {
  const sigs = await getSignaturesForAddress(owner, { limit: SIG_PAGE });
  const reachedOldest = sigs.length < SIG_PAGE;
  const profile: WalletProfile = {
    owner,
    reachedOldest,
    txCount: sigs.length,
    firstSeen: null,
    firstSig: null,
    funder: null,
    fundedAt: null,
    fundingSig: null,
  };
  if (!reachedOldest || sigs.length === 0) return profile;
  const oldest = sigs[sigs.length - 1];
  profile.firstSig = oldest.signature;
  profile.firstSeen = oldest.blockTime ? oldest.blockTime * 1000 : null;
  const tx = await getTransactionParsed(oldest.signature);
  if (tx) {
    const funder = findFunder(tx, owner);
    if (funder && funder !== owner) {
      profile.funder = funder;
      profile.fundedAt = tx.blockTime ? tx.blockTime * 1000 : profile.firstSeen;
      profile.fundingSig = oldest.signature;
    }
  }
  return profile;
}

export async function collectSnapshot(mint: string): Promise<TokenSnapshot> {
  const now = Date.now();
  const mintInfo = await loadMint(mint);
  const mf = (mintInfo as Extract<typeof mintInfo, { ok: true }>).data;

  const [pairsRaw, largestRaw] = await Promise.all([
    settle("DexScreener", () => getTokenPairs(mint)),
    settle("Solana RPC", () => getTokenLargestAccounts(mint)),
  ]);
  const pairs: Fetched<PairFacts[]> = pairsRaw.ok ? { ...pairsRaw, data: pairsRaw.data.map(toPairFacts) } : pairsRaw;
  const pairAddrs = new Set(pairs.ok ? pairs.data.map((p) => p.pairAddress) : []);

  const metaSource: SourceName = dasAvailable() ? "Helius DAS" : "Solana RPC";
  const [metadataRaw, lp, largest] = await Promise.all([
    settle(metaSource, () => loadMetadata(mint, mf, pairsRaw.ok ? pairsRaw.data : null)),
    settle<LpFacts[]>("Raydium API", async () => {
      if (!pairs.ok) return [];
      const ray = pairs.data.filter((p) => p.dexId === "raydium").map((p) => p.pairAddress);
      const info = await getRaydiumPools(ray);
      return Object.values(info).map((r) => ({
        pairAddress: r.id,
        fungibleLp: r.type === "Standard" && r.lpMint !== null,
        burnPercent: r.burnPercent,
        lpMint: r.lpMint,
      }));
    }),
    largestRaw.ok
      ? settle<LargestAccountFacts[]>("Solana RPC", async () => {
          const accs = await getMultipleAccountsParsed<TokenAccountInfoRaw>(largestRaw.data.map((a) => a.address));
          return largestRaw.data.map((a, i) => {
            const acc = accs[i];
            const owner = acc && !Array.isArray(acc.data) ? acc.data.parsed.info.owner : null;
            return {
              tokenAccount: a.address,
              owner,
              ownerOnCurve: owner ? isOnCurve(owner) : null,
              amount: Number(a.uiAmountString),
            };
          });
        })
      : Promise.resolve(largestRaw as Fetched<LargestAccountFacts[]>),
  ]);
  const metadata: Fetched<MetadataFacts> = metadataRaw.ok
    ? (() => {
        const { _source, ...data } = metadataRaw.data;
        void _source;
        return { ...metadataRaw, data };
      })()
    : metadataRaw;

  // Wallet profiles for the largest plain-wallet holders (heuristic checks).
  const walletOwners: string[] = [];
  if (largest.ok) {
    for (const a of largest.data) {
      if (!a.owner || !a.ownerOnCurve || KNOWN_OWNERS[a.owner] || pairAddrs.has(a.owner)) continue;
      if (!walletOwners.includes(a.owner)) walletOwners.push(a.owner);
      if (walletOwners.length >= PROFILE_WALLETS) break;
    }
  }
  const wallets: Fetched<WalletProfile[]> = largest.ok
    ? await settle("Solana RPC", () => Promise.all(walletOwners.map(profileWallet)))
    : failed("Solana RPC", "Holder list unavailable, so wallets could not be profiled");

  // Likely dev wallets: authorities and recorded creators that are regular wallets.
  const dev = await settle<DevHolding[]>("Solana RPC", async () => {
    const cands: Array<{ address: string; role: string }> = [];
    const add = (address: string | null | undefined, role: string) => {
      if (!address || !isOnCurve(address) || cands.some((c) => c.address === address)) return;
      cands.push({ address, role });
    };
    add(mf.mintAuthority, "Mint authority");
    add(mf.freezeAuthority, "Freeze authority");
    if (metadata.ok) {
      add(metadata.data.updateAuthority, "Metadata update authority");
      add(metadata.data.creators[0], "Creator");
    }
    add(mf.inlineMetadata?.updateAuthority, "Metadata update authority");
    const known = new Map<string, number>();
    if (largest.ok) for (const a of largest.data) if (a.owner) known.set(a.owner, (known.get(a.owner) ?? 0) + a.amount);
    return Promise.all(
      cands.slice(0, 4).map(async (c) => ({
        ...c,
        amount: known.has(c.address) ? (known.get(c.address) as number) : await getOwnerTokenBalance(c.address, mint),
      })),
    );
  });

  return { mint, now, mintInfo, metadata, pairs, lp, largest, wallets, dev };
}
