import "server-only";
import { repo } from "@/lib/db";
import type { WatchItem, Watchlist } from "@/lib/db/types";
import { getCached, recordScan, runFreshScan } from "@/lib/scan/run";
import { tierForWallet } from "@/lib/auth/tier";
import { logError } from "@/lib/log";
import { APP_NAME, LINKS } from "@/lib/config";
import { diffSnapshots, isAllowedWebhook, toWatchSnapshot } from "./diff";

type Item = WatchItem & { list: Omit<Watchlist, "items"> };

async function deliverWebhook(url: string, lines: string[], mint: string) {
  if (!isAllowedWebhook(url)) return;
  try {
    const content = `**${APP_NAME} alert**\n${lines.map((l) => `• ${l}`).join("\n")}\n<${LINKS.dexscreener(mint)}>`.slice(0, 1900);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    logError("alerts:webhook", e);
  }
}

/**
 * Re-scans watched tokens and raises alerts on meaningful changes.
 * Alerts are only generated for lists owned by wallets whose tier includes alerts.
 */
export async function checkItems(items: Item[], deadlineMs = 45_000): Promise<{ checked: number; alerts: number }> {
  const started = Date.now();
  const tierCache = new Map<string, boolean>();
  let checked = 0;
  let alerts = 0;
  for (const it of items) {
    if (Date.now() - started > deadlineMs) break;
    try {
      const report = (await getCached(it.mint))?.report ?? (await runFreshScan(it.mint));
      const next = toWatchSnapshot(report);
      const wallet = it.list.wallet;
      if (!tierCache.has(wallet)) tierCache.set(wallet, (await tierForWallet(wallet)).tier.alerts);
      if (it.snapshot && tierCache.get(wallet)) {
        const label = report.token.symbol ? `$${report.token.symbol}` : (report.token.name ?? it.mint.slice(0, 6));
        const found = diffSnapshots(it.snapshot, next, it.list, label);
        for (const a of found) {
          await repo().createAlert({ wallet, watchlist_id: it.list.id, mint: it.mint, kind: a.kind, message: a.message, details: a.details });
        }
        if (found.length && it.list.webhook_url) await deliverWebhook(it.list.webhook_url, found.map((f) => f.message), it.mint);
        alerts += found.length;
      }
      await repo().updateWatchItem(it.id, next, new Date());
      void recordScan(report, { wallet: null, ipHash: null }, "alert");
      checked++;
    } catch (e) {
      logError("alerts:check", e, { mint: it.mint });
      // Push it back in the queue so one bad token doesn't block the rest.
      if (it.snapshot) await repo().updateWatchItem(it.id, it.snapshot, new Date()).catch(() => {});
    }
  }
  return { checked, alerts };
}

export const STALE_AFTER_MS = 30 * 60_000;

export async function runAlertSweep(limit = 40) {
  const items = await repo().staleWatchItems(new Date(Date.now() - STALE_AFTER_MS), limit);
  const res = await checkItems(items);
  await repo().prune().catch((e) => logError("alerts:prune", e));
  return res;
}
