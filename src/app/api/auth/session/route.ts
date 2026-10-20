import { getViewer, withViewer } from "@/lib/auth/viewer";
import { sessionInfo } from "@/lib/auth/info";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export async function GET(req: Request) {
  const v = await getViewer(req);
  const rl = await rateLimit(`session:${v.ipHash}`, 120, 60);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const info = await sessionInfo(v);
  return withViewer(v, Response.json({ session: info }, { headers: { "cache-control": "no-store" } }));
}
