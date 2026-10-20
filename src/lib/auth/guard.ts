import "server-only";
import type { TierDef } from "@/lib/config";
import { jsonError, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getViewer, withViewer, type Viewer } from "./viewer";

type Guard = { ok: true; viewer: Viewer & { wallet: string } } | { ok: false; res: Response };

/**
 * Requires a verified wallet session whose tier passes `allow`.
 * Also enforces same-origin for mutations and a per-wallet rate limit.
 */
export async function requireWallet(
  req: Request,
  allow: (t: TierDef) => boolean,
  opts: { feature: string; minTier: number; limit?: number },
): Promise<Guard> {
  if (req.method !== "GET" && !sameOrigin(req)) return { ok: false, res: jsonError(403, "forbidden", "Cross-origin request rejected.") };
  const viewer = await getViewer(req);
  if (!viewer.wallet) return { ok: false, res: jsonError(401, "not_signed_in", "Verify your wallet first.") };
  if (!allow(viewer.tier)) {
    return {
      ok: false,
      res: withViewer(viewer, jsonError(403, "tier_required", `${opts.feature} requires tier ${opts.minTier} or above.`, { requiredTier: opts.minTier })),
    };
  }
  const rl = await rateLimit(`w:${viewer.wallet}:${opts.feature}`, opts.limit ?? 60, 60);
  if (!rl.ok) return { ok: false, res: jsonError(429, "rate_limited", "Too many requests. Slow down a little.") };
  return { ok: true, viewer: viewer as Viewer & { wallet: string } };
}
