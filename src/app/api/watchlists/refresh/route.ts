import { requireWallet } from "@/lib/auth/guard";
import { withViewer } from "@/lib/auth/viewer";
import { repo } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { checkItems } from "@/lib/alerts/run";
import { logError } from "@/lib/log";

export const maxDuration = 60;

const FRESH_MS = 10 * 60_000;

/** Re-checks the caller's own watched tokens that are older than 10 minutes (max 10 per call). */
export async function POST(req: Request) {
  const g = await requireWallet(req, (t) => t.watchlists > 0, { feature: "Watchlist refresh", minTier: 1, limit: 4 });
  if (!g.ok) return g.res;
  try {
    const lists = await repo().listWatchlists(g.viewer.wallet);
    const cutoff = Date.now() - FRESH_MS;
    const stale = lists
      .flatMap(({ items, ...list }) => items.map((it) => ({ ...it, list })))
      .filter((it) => !it.checked_at || Date.parse(it.checked_at) < cutoff)
      .slice(0, 10);
    const res = await checkItems(stale, 40_000);
    return withViewer(g.viewer, Response.json({ ok: true, ...res }));
  } catch (e) {
    logError("api/watchlists:refresh", e);
    return jsonError(502, "refresh_failed", "Couldn't refresh right now.");
  }
}
