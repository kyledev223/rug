import { getViewer, withViewer } from "@/lib/auth/viewer";
import { repo } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { logError } from "@/lib/log";

export async function GET(req: Request) {
  const v = await getViewer(req);
  if (!v.wallet) return jsonError(401, "not_signed_in", "Verify your wallet to see scan history.");
  if (!v.tier.history) return withViewer(v, jsonError(403, "tier_required", "Scan history needs Holder I or above.", { requiredTier: 1 }));
  const rl = await rateLimit(`history:${v.wallet}`, 60, 60);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    const rows = await repo().scanHistory(v.wallet, 100);
    return withViewer(v, Response.json({ history: rows }, { headers: { "cache-control": "no-store" } }));
  } catch (e) {
    logError("api/history", e);
    return jsonError(503, "storage_error", "History is temporarily unavailable.");
  }
}
