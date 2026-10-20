import { requireWallet } from "@/lib/auth/guard";
import { withViewer } from "@/lib/auth/viewer";
import { repo } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { logError } from "@/lib/log";

const allow = (t: { watchlists: number }) => t.watchlists > 0;

export async function GET(req: Request) {
  const g = await requireWallet(req, allow, { feature: "Watchlists", minTier: 1 });
  if (!g.ok) return g.res;
  try {
    const [lists, alerts] = await Promise.all([repo().listWatchlists(g.viewer.wallet), repo().listAlerts(g.viewer.wallet, 50)]);
    return withViewer(
      g.viewer,
      Response.json(
        {
          lists,
          alerts,
          limits: { watchlists: g.viewer.tier.watchlists, size: g.viewer.tier.watchlistSize, alerts: g.viewer.tier.alerts },
        },
        { headers: { "cache-control": "no-store" } },
      ),
    );
  } catch (e) {
    logError("api/watchlists", e);
    return jsonError(503, "storage_error", "Watchlists are temporarily unavailable.");
  }
}

export async function POST(req: Request) {
  const g = await requireWallet(req, allow, { feature: "Watchlists", minTier: 1, limit: 20 });
  if (!g.ok) return g.res;
  const body = await readJson<{ name?: unknown }>(req, 1024);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return jsonError(400, "invalid_name", "Give the watchlist a name (max 40 characters).");
  try {
    const existing = await repo().listWatchlists(g.viewer.wallet);
    if (existing.length >= g.viewer.tier.watchlists) {
      return jsonError(403, "limit_reached", `Your tier allows ${g.viewer.tier.watchlists} watchlist(s).`);
    }
    const list = await repo().createWatchlist(g.viewer.wallet, name);
    return withViewer(g.viewer, Response.json({ list }, { status: 201 }));
  } catch (e) {
    logError("api/watchlists:create", e);
    return jsonError(503, "storage_error", "Couldn't create the watchlist.");
  }
}
