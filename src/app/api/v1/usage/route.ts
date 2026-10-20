import { authenticateApiKey } from "@/lib/auth/apikey";
import { jsonError } from "@/lib/http";
import { peekDaily, rateLimit } from "@/lib/ratelimit";
import { API_LIMITS } from "@/lib/config";

/** GET /api/v1/usage — today's request count for the calling key. */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message);
  const rl = await rateLimit(`api-usage:${auth.keyId}`, 30, 60);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const used = await peekDaily(`api:${auth.keyId}`);
  return Response.json(
    { wallet: auth.wallet, tier: auth.tier.id, usedToday: used, limits: API_LIMITS, resetsAt: new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000).toISOString() },
    { headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } },
  );
}
