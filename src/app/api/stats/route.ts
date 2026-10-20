import { repo } from "@/lib/db";
import { clientIp, hashIp, jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { logError } from "@/lib/log";

/** Real counters from the scan log. Returns nulls (never made-up numbers) if unavailable. */
export async function GET(req: Request) {
  const rl = await rateLimit(`stats:${hashIp(clientIp(req))}`, 60, 60);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  try {
    const s = await repo().stats();
    return Response.json(
      { totalScans: Number(s.total_scans), flaggedToday: Number(s.flagged_today), scansToday: Number(s.scans_today) },
      { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (e) {
    logError("api/stats", e);
    return Response.json({ totalScans: null, flaggedToday: null, scansToday: null });
  }
}
