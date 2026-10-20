import { requireWallet } from "@/lib/auth/guard";
import { withViewer } from "@/lib/auth/viewer";
import { repo } from "@/lib/db";
import type { WatchlistPatch } from "@/lib/db/types";
import { jsonError, readJson } from "@/lib/http";
import { isAllowedWebhook } from "@/lib/alerts/diff";
import { logError } from "@/lib/log";

const allow = (t: { watchlists: number }) => t.watchlists > 0;
const UUID = /^[0-9a-f-]{36}$/i;

export async function PATCH(req: Request, ctx: RouteContext<"/api/watchlists/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError(400, "invalid_id", "Invalid watchlist id.");
  const g = await requireWallet(req, allow, { feature: "Watchlists", minTier: 1, limit: 30 });
  if (!g.ok) return g.res;
  const body = await readJson<Record<string, unknown>>(req, 2048);
  if (!body) return jsonError(400, "invalid_body", "Invalid JSON body.");

  const patch: WatchlistPatch = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 40);
  const alertKeys = ["alert_score_change", "alert_authority", "alert_liquidity_drop_pct", "alert_holder_dump_pct", "webhook_url"];
  if (alertKeys.some((k) => k in body) && !g.viewer.tier.alerts) {
    return jsonError(403, "tier_required", "Alerts require Holder II or above.", { requiredTier: 2 });
  }
  if (typeof body.alert_score_change === "boolean") patch.alert_score_change = body.alert_score_change;
  if (typeof body.alert_authority === "boolean") patch.alert_authority = body.alert_authority;
  if (typeof body.alert_liquidity_drop_pct === "number") {
    patch.alert_liquidity_drop_pct = Math.round(Math.min(95, Math.max(0, body.alert_liquidity_drop_pct)));
  }
  if (typeof body.alert_holder_dump_pct === "number") {
    patch.alert_holder_dump_pct = Math.round(Math.min(50, Math.max(0, body.alert_holder_dump_pct)) * 10) / 10;
  }
  if ("webhook_url" in body) {
    const url = typeof body.webhook_url === "string" ? body.webhook_url.trim() : "";
    if (url && !isAllowedWebhook(url)) return jsonError(400, "invalid_webhook", "Only Discord webhook URLs are supported.");
    patch.webhook_url = url || null;
  }
  try {
    const ok = await repo().updateWatchlist(id, g.viewer.wallet, patch);
    if (!ok) return jsonError(404, "not_found", "Watchlist not found.");
    return withViewer(g.viewer, Response.json({ ok: true }));
  } catch (e) {
    logError("api/watchlists:patch", e);
    return jsonError(503, "storage_error", "Couldn't update the watchlist.");
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/watchlists/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError(400, "invalid_id", "Invalid watchlist id.");
  const g = await requireWallet(req, allow, { feature: "Watchlists", minTier: 1, limit: 20 });
  if (!g.ok) return g.res;
  try {
    const ok = await repo().deleteWatchlist(id, g.viewer.wallet);
    if (!ok) return jsonError(404, "not_found", "Watchlist not found.");
    return withViewer(g.viewer, Response.json({ ok: true }));
  } catch (e) {
    logError("api/watchlists:delete", e);
    return jsonError(503, "storage_error", "Couldn't delete the watchlist.");
  }
}
