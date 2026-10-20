import { authenticateApiKey } from "@/lib/auth/apikey";
import { repo } from "@/lib/db";
import { clientIp, hashIp, jsonError } from "@/lib/http";
import { isValidPublicKey } from "@/lib/solana/address";
import { consumeDaily, limitHeaders, rateLimit } from "@/lib/ratelimit";
import { getCached, recordScan, runFreshScan } from "@/lib/scan/run";
import { ScanInputError } from "@/lib/scan/collect";
import { templateExplanation } from "@/lib/scan/explain";
import { logError } from "@/lib/log";
import { API_LIMITS, DISCLAIMER } from "@/lib/config";

export const maxDuration = 60;


const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-api-key, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function withCors(res: Response) {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

/** GET /api/v1/scan?mint=<address>  (tier 3 API key required) */
export async function GET(req: Request) {
  const ipLimit = await rateLimit(`api-ip:${hashIp(clientIp(req))}`, 120, 60);
  if (!ipLimit.ok) return withCors(jsonError(429, "rate_limited", "Too many requests from this IP."));
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return withCors(jsonError(auth.status, auth.code, auth.message));

  const burst = await rateLimit(`api:${auth.keyId}`, API_LIMITS.perMinute, 60);
  if (!burst.ok) return withCors(jsonError(429, "rate_limited", `Limit is ${API_LIMITS.perMinute} requests/minute.`, {}, limitHeaders(burst)));

  const mint = new URL(req.url).searchParams.get("mint")?.trim() ?? "";
  if (!isValidPublicKey(mint)) return withCors(jsonError(400, "invalid_mint", "Pass a valid base58 mint as ?mint="));

  const day = await consumeDaily(`api:${auth.keyId}`, API_LIMITS.perDay);
  if (!day.ok) return withCors(jsonError(429, "quota_exceeded", `Daily limit is ${API_LIMITS.perDay} requests.`, {}, limitHeaders(day)));
  void repo().touchApiKey(auth.keyId).catch(() => {});

  try {
    const cached = await getCached(mint);
    const report = cached?.report ?? (await runFreshScan(mint));
    void recordScan(report, { wallet: auth.wallet, ipHash: null }, "api");
    const explanation = cached?.explanation ?? templateExplanation(report);
    return withCors(
      Response.json(
        { report, explanation, cached: Boolean(cached), disclaimer: DISCLAIMER },
        { headers: { ...limitHeaders(day), "cache-control": "no-store" } },
      ),
    );
  } catch (e) {
    if (e instanceof ScanInputError) return withCors(jsonError(e.status, "not_a_mint", e.message));
    logError("api/v1/scan", e, { mint });
    return withCors(jsonError(502, "upstream_error", "A data source failed while scanning. Retry shortly."));
  }
}
