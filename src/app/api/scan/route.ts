import { isValidPublicKey } from "@/lib/solana/address";
import { jsonError, readJson, sameOrigin } from "@/lib/http";
import { getViewer, quotaSubject, withViewer } from "@/lib/auth/viewer";
import { consumeDaily, limitHeaders, rateLimit } from "@/lib/ratelimit";
import { getCached, recordScan, runFreshScan } from "@/lib/scan/run";
import { ScanInputError } from "@/lib/scan/collect";
import { templateExplanation } from "@/lib/scan/explain";
import { logError } from "@/lib/log";
import { TOKEN_TICKER } from "@/lib/config";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "forbidden", "Cross-origin request rejected.");
  const body = await readJson<{ mint?: unknown; via?: unknown }>(req);
  const mint = typeof body?.mint === "string" ? body.mint.trim() : "";
  if (!isValidPublicKey(mint)) {
    return jsonError(400, "invalid_mint", "That isn't a valid Solana address (base58, 32 bytes).");
  }
  const via = body?.via === "bulk" ? "bulk" : "web";

  const viewer = await getViewer(req);
  const burst = viewer.wallet
    ? await rateLimit(`scan:w:${viewer.wallet}`, 60, 60)
    : await rateLimit(`scan:ip:${viewer.ipHash}`, 20, 60);
  if (!burst.ok) return jsonError(429, "rate_limited", "Too many requests. Slow down a little.", {}, limitHeaders(burst));

  if (via === "bulk" && !viewer.tier.bulk) {
    return jsonError(403, "tier_required", "Bulk scanning requires Holder II or above.", { requiredTier: 2 });
  }

  const who = { wallet: viewer.wallet, ipHash: viewer.ipHash };
  const cached = await getCached(mint);
  if (cached) {
    void recordScan(cached.report, who, via);
    return withViewer(
      viewer,
      Response.json({
        report: cached.report,
        explanation: cached.explanation ?? templateExplanation(cached.report),
        cached: true,
      }),
    );
  }

  // Only fresh scans (which cost API quota) count toward the daily limit.
  const quota = await consumeDaily(quotaSubject(viewer), viewer.tier.dailyScans);
  if (!quota.ok) {
    return jsonError(
      429,
      "quota_exceeded",
      viewer.tier.id === 0
        ? `Free limit reached (${viewer.tier.dailyScans} scans/day). Hold ${TOKEN_TICKER} to unlock more, or come back after the UTC reset.`
        : `Daily limit reached (${viewer.tier.dailyScans} scans/day for ${viewer.tier.name}).`,
      { tier: viewer.tier.id, resetAt: quota.resetAt.toISOString() },
      limitHeaders(quota),
    );
  }

  try {
    const report = await runFreshScan(mint);
    void recordScan(report, who, via);
    return withViewer(
      viewer,
      Response.json(
        { report, explanation: templateExplanation(report), cached: false },
        { headers: viewer.tier.dailyScans === null ? {} : limitHeaders(quota) },
      ),
    );
  } catch (e) {
    if (e instanceof ScanInputError) return jsonError(e.status, "not_a_mint", e.message);
    logError("api/scan", e, { mint });
    return jsonError(502, "upstream_error", "A data source failed while scanning. Please try again in a moment.");
  }
}
