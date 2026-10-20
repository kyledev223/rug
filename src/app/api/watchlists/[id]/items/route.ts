import { requireWallet } from "@/lib/auth/guard";
import { withViewer } from "@/lib/auth/viewer";
import { repo } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { isValidPublicKey } from "@/lib/solana/address";
import { getCached, runFreshScan } from "@/lib/scan/run";
import { ScanInputError } from "@/lib/scan/collect";
import { toWatchSnapshot } from "@/lib/alerts/diff";
import { logError } from "@/lib/log";

export const maxDuration = 60;

const allow = (t: { watchlists: number }) => t.watchlists > 0;
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request, ctx: RouteContext<"/api/watchlists/[id]/items">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError(400, "invalid_id", "Invalid watchlist id.");
  const g = await requireWallet(req, allow, { feature: "Watchlists", minTier: 1, limit: 30 });
  if (!g.ok) return g.res;
  const body = await readJson<{ mint?: unknown }>(req, 1024);
  const mint = typeof body?.mint === "string" ? body.mint.trim() : "";
  if (!isValidPublicKey(mint)) return jsonError(400, "invalid_mint", "Invalid mint address.");

  try {
    const list = (await repo().listWatchlists(g.viewer.wallet)).find((l) => l.id === id);
    if (!list) return jsonError(404, "not_found", "Watchlist not found.");
    if (list.items.some((i) => i.mint === mint)) return withViewer(g.viewer, Response.json({ ok: true, duplicate: true }));
    if (list.items.length >= g.viewer.tier.watchlistSize) {
      return jsonError(403, "limit_reached", `This watchlist is full (${g.viewer.tier.watchlistSize} tokens for your tier).`);
    }
    // Baseline snapshot so the first change can be detected.
    const report = (await getCached(mint))?.report ?? (await runFreshScan(mint));
    await repo().addWatchItem(id, g.viewer.wallet, {
      mint,
      name: report.token.name,
      symbol: report.token.symbol,
      snapshot: toWatchSnapshot(report),
    });
    return withViewer(g.viewer, Response.json({ ok: true }, { status: 201 }));
  } catch (e) {
    if (e instanceof ScanInputError) return jsonError(e.status, "not_a_mint", e.message);
    logError("api/watchlists:add", e);
    return jsonError(502, "upstream_error", "Couldn't add the token right now. Try again shortly.");
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/watchlists/[id]/items">) {
  const { id } = await ctx.params;
  const mint = new URL(req.url).searchParams.get("mint") ?? "";
  if (!UUID.test(id) || !isValidPublicKey(mint)) return jsonError(400, "invalid_request", "Invalid watchlist id or mint.");
  const g = await requireWallet(req, allow, { feature: "Watchlists", minTier: 1, limit: 30 });
  if (!g.ok) return g.res;
  try {
    const ok = await repo().removeWatchItem(id, g.viewer.wallet, mint);
    if (!ok) return jsonError(404, "not_found", "Watchlist not found.");
    return withViewer(g.viewer, Response.json({ ok: true }));
  } catch (e) {
    logError("api/watchlists:remove", e);
    return jsonError(503, "storage_error", "Couldn't remove the token.");
  }
}
