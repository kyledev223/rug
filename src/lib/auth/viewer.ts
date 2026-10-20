import "server-only";
import { BALANCE_RECHECK_MS, tierById, type TierDef, type TierId } from "@/lib/config";
import { clientIp, hashIp } from "@/lib/http";
import { logError } from "@/lib/log";
import { SESSION_COOKIE, decodeSession, encodeSession, readCookie, sessionCookie, type SessionPayload } from "./session";
import { checkTier } from "./tier";

export interface Viewer {
  ip: string;
  ipHash: string;
  wallet: string | null;
  tier: TierDef;
  balance: number;
  checkedAt: number | null;
  /** Set-Cookie value when the session was refreshed during this request. */
  setCookie?: string;
}

/**
 * Who is making this request. A verified wallet session carries its tier;
 * the balance is re-checked on-chain once the last check is older than BALANCE_RECHECK_MS.
 */
export async function getViewer(req: Request): Promise<Viewer> {
  const ip = clientIp(req);
  const base: Viewer = { ip, ipHash: hashIp(ip), wallet: null, tier: tierById(0), balance: 0, checkedAt: null };
  const s = decodeSession(readCookie(req, SESSION_COOKIE));
  if (!s) return base;

  if (Date.now() - s.c < BALANCE_RECHECK_MS) {
    return { ...base, wallet: s.w, tier: tierById(s.t), balance: s.b, checkedAt: s.c };
  }
  try {
    const fresh = await checkTier(s.w);
    const next: SessionPayload = { ...s, t: fresh.tier.id, b: fresh.balance, c: fresh.checkedAt };
    return {
      ...base,
      wallet: s.w,
      tier: fresh.tier,
      balance: fresh.balance,
      checkedAt: fresh.checkedAt,
      setCookie: sessionCookie(encodeSession(next), s.exp - Date.now()),
    };
  } catch (e) {
    logError("viewer:recheck", e);
    // RPC trouble: honour the last known tier for one more window, then fall back to free.
    const stale = Date.now() - s.c >= 2 * BALANCE_RECHECK_MS;
    return { ...base, wallet: s.w, tier: tierById(stale ? 0 : (s.t as TierId)), balance: s.b, checkedAt: s.c };
  }
}

/** Daily quota subject: wallet for holders, hashed IP for everyone else. */
export function quotaSubject(v: Viewer): string {
  return v.wallet && v.tier.id > 0 ? `w:${v.wallet}` : `ip:${v.ipHash}`;
}

/** Attaches a refreshed session cookie (if any) to a response. */
export function withViewer(v: Viewer, res: Response): Response {
  if (v.setCookie) res.headers.append("set-cookie", v.setCookie);
  return res;
}
