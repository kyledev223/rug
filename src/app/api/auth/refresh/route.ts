import { checkTier } from "@/lib/auth/tier";
import { sessionInfo } from "@/lib/auth/info";
import { SESSION_COOKIE, decodeSession, encodeSession, readCookie, sessionCookie } from "@/lib/auth/session";
import { clientIp, hashIp, jsonError, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { logError } from "@/lib/log";

/** Re-reads the wallet's balance on demand (e.g. right after buying). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "forbidden", "Cross-origin request rejected.");
  const s = decodeSession(readCookie(req, SESSION_COOKIE));
  if (!s) return jsonError(401, "not_signed_in", "Verify your wallet first.");
  const rl = await rateLimit(`refresh:${s.w}`, 3, 60);
  if (!rl.ok) return jsonError(429, "rate_limited", "Balance was just checked. Try again in a minute.");
  try {
    const fresh = await checkTier(s.w);
    const cookie = sessionCookie(encodeSession({ ...s, t: fresh.tier.id, b: fresh.balance, c: fresh.checkedAt }), s.exp - Date.now());
    const ip = clientIp(req);
    const info = await sessionInfo({ ip, ipHash: hashIp(ip), wallet: s.w, tier: fresh.tier, balance: fresh.balance, checkedAt: fresh.checkedAt });
    return Response.json({ session: info }, { headers: { "set-cookie": cookie } });
  } catch (e) {
    logError("auth/refresh", e);
    return jsonError(502, "balance_unavailable", "Couldn't read your balance right now. Try again shortly.");
  }
}
