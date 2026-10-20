/**
 * Minimal Solana JSON-RPC client (Helius when HELIUS_API_KEY is set).
 * Bounded concurrency + retry on 429/5xx so free-tier limits are respected.
 */
import { serverEnv } from "@/lib/env";

const MAX_CONCURRENCY = 5;
const TIMEOUT_MS = 12_000;

let active = 0;
const queue: Array<() => void> = [];

async function acquire() {
  if (active < MAX_CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  active++;
}

function release() {
  active--;
  queue.shift()?.();
}

export class RpcError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export function rpcUrl(): string {
  const env = serverEnv();
  if (env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  return env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}

export function hasHelius(): boolean {
  return Boolean(serverEnv().HELIUS_API_KEY);
}

export async function rpc<T>(method: string, params: unknown[] | Record<string, unknown>): Promise<T> {
  await acquire();
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(400 * 2 ** attempt);
      try {
        const res = await fetch(rpcUrl(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new RpcError(`${method}: HTTP ${res.status}`, res.status);
          continue;
        }
        const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
        if (body.error) {
          // -32429 / 429 inside the body is also a rate limit
          if (body.error.code === 429 || body.error.code === -32429) {
            lastErr = new RpcError(`${method}: rate limited`, 429);
            continue;
          }
          throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
        }
        return body.result as T;
      } catch (e) {
        if (e instanceof RpcError && e.code !== 429 && (e.code ?? 0) < 500) throw e;
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new RpcError(`${method}: failed`);
  } finally {
    release();
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- typed helpers ----------

export interface ParsedAccount<T = unknown> {
  owner: string; // program owner
  lamports: number;
  data: { program: string; parsed: { type: string; info: T } } | [string, string];
}

export interface MintInfoRaw {
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
  extensions?: Array<{ extension: string; state?: Record<string, unknown> }>;
}

export interface TokenAccountInfoRaw {
  mint: string;
  owner: string;
  tokenAmount: { amount: string; decimals: number; uiAmount: number | null; uiAmountString: string };
}

export async function getAccountInfoParsed<T>(address: string): Promise<ParsedAccount<T> | null> {
  const r = await rpc<{ value: ParsedAccount<T> | null }>("getAccountInfo", [
    address,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  return r.value;
}

export async function getMultipleAccountsParsed<T>(addresses: string[]): Promise<Array<ParsedAccount<T> | null>> {
  if (addresses.length === 0) return [];
  const r = await rpc<{ value: Array<ParsedAccount<T> | null> }>("getMultipleAccounts", [
    addresses,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  return r.value;
}

export interface LargestAccount {
  address: string;
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

export async function getTokenLargestAccounts(mint: string): Promise<LargestAccount[]> {
  const r = await rpc<{ value: LargestAccount[] }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
  return r.value;
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

export async function getSignaturesForAddress(
  address: string,
  opts: { limit?: number; before?: string } = {},
): Promise<SignatureInfo[]> {
  return rpc<SignatureInfo[]>("getSignaturesForAddress", [address, { commitment: "confirmed", ...opts }]);
}

export interface ParsedInstruction {
  program?: string;
  programId: string;
  parsed?: { type: string; info: Record<string, unknown> };
}

export interface ParsedTransaction {
  blockTime: number | null;
  slot: number;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
      instructions: ParsedInstruction[];
    };
  };
  meta: {
    err: unknown;
    innerInstructions?: Array<{ index: number; instructions: ParsedInstruction[] }>;
  } | null;
}

export async function getTransactionParsed(signature: string): Promise<ParsedTransaction | null> {
  return rpc<ParsedTransaction | null>("getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
}

/** Sum of a wallet's balance of `mint` across all its token accounts (UI units). */
export async function getOwnerTokenBalance(owner: string, mint: string): Promise<number> {
  const r = await rpc<{
    value: Array<{ pubkey: string; account: ParsedAccount<TokenAccountInfoRaw> }>;
  }>("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  let total = 0;
  for (const a of r.value) {
    const d = a.account.data;
    if (!Array.isArray(d)) {
      const amt = d.parsed.info.tokenAmount;
      total += Number(amt.uiAmountString);
    }
  }
  return total;
}
