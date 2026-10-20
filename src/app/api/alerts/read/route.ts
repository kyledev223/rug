import { requireWallet } from "@/lib/auth/guard";
import { withViewer } from "@/lib/auth/viewer";
import { repo } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { logError } from "@/lib/log";

export async function POST(req: Request) {
  const g = await requireWallet(req, (t) => t.watchlists > 0, { feature: "Alerts", minTier: 1, limit: 20 });
  if (!g.ok) return g.res;
  try {
    await repo().markAlertsRead(g.viewer.wallet);
    return withViewer(g.viewer, Response.json({ ok: true }));
  } catch (e) {
    logError("api/alerts:read", e);
    return jsonError(503, "storage_error", "Couldn't update alerts.");
  }
}
