import "server-only";
import { BALANCE_RECHECK_MS, TIERS, TOKEN_MINT } from "@/lib/config";
import { peekDaily } from "@/lib/ratelimit";
import { quotaSubject, type Viewer } from "./viewer";

/** Public view of a session for the "Your tier" panel. */
export async function sessionInfo(v: Viewer) {
  const next = TIERS.find((t) => t.id === v.tier.id + 1) ?? null;
  const used = await peekDaily(quotaSubject(v));
  return {
    wallet: v.wallet,
    tier: v.tier.id,
    tierName: v.tier.name,
    balance: v.balance,
    checkedAt: v.checkedAt ? new Date(v.checkedAt).toISOString() : null,
    nextCheckAt: v.checkedAt ? new Date(v.checkedAt + BALANCE_RECHECK_MS).toISOString() : null,
    tokenLaunched: Boolean(TOKEN_MINT),
    next: next
      ? { tier: next.id, name: next.name, minBalance: next.minBalance, needed: Math.max(0, next.minBalance - v.balance), perks: next.perks }
      : null,
    usage: { scansToday: used, dailyLimit: v.tier.dailyScans },
    features: {
      history: v.tier.history,
      watchlists: v.tier.watchlists,
      watchlistSize: v.tier.watchlistSize,
      bulk: v.tier.bulk,
      alerts: v.tier.alerts,
      apiKey: v.tier.apiKey,
    },
  };
}

export type SessionInfo = Awaited<ReturnType<typeof sessionInfo>>;
