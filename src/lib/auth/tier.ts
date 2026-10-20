import "server-only";
import { BALANCE_RECHECK_MS, TOKEN_MINT, tierById, tierForBalance, type TierDef, type TierId } from "@/lib/config";
import { serverEnv } from "@/lib/env";
import { getOwnerTokenBalance } from "@/lib/sources/rpc";
import { repo } from "@/lib/db";
import { logError } from "@/lib/log";

export interface TierCheck {
  tier: TierDef;
  balance: number;
  checkedAt: number;
}

/** Reads the wallet's holder-token balance on-chain and maps it to a tier. Throws on RPC failure. */
export async function checkTier(wallet: string): Promise<TierCheck> {
  const env = serverEnv();
  const balance = TOKEN_MINT ? await getOwnerTokenBalance(wallet, TOKEN_MINT) : 0;
  let tier = tierForBalance(balance);
  if (env.DEV_FORCE_TIER !== undefined) tier = tierById(env.DEV_FORCE_TIER as TierId);
  const checkedAt = Date.now();
  try {
    await repo().upsertWallet({ address: wallet, tier: tier.id, balance, checked_at: new Date(checkedAt).toISOString() });
  } catch (e) {
    logError("tier:upsert", e);
  }
  return { tier, balance, checkedAt };
}

/**
 * Tier for a wallet using a cached check when fresh enough (for API-key requests).
 * Falls back to the last known tier for one extra window if the RPC is down.
 */
export async function tierForWallet(wallet: string): Promise<TierCheck> {
  const row = await repo().getWallet(wallet).catch(() => null);
  const age = row ? Date.now() - Date.parse(row.checked_at) : Infinity;
  if (row && age < BALANCE_RECHECK_MS) {
    return { tier: tierById(row.tier as TierId), balance: row.balance, checkedAt: Date.parse(row.checked_at) };
  }
  try {
    return await checkTier(wallet);
  } catch (e) {
    logError("tier:check", e);
    if (row && age < 2 * BALANCE_RECHECK_MS) {
      return { tier: tierById(row.tier as TierId), balance: row.balance, checkedAt: Date.parse(row.checked_at) };
    }
    return { tier: tierById(0), balance: 0, checkedAt: Date.now() };
  }
}
