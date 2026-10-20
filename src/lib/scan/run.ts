import "server-only";
import { ENGINE_VERSION, SCAN_CACHE_TTL_MS } from "@/lib/config";
import { repo } from "@/lib/db";
import { logError } from "@/lib/log";
import { collectSnapshot } from "./collect";
import { buildReport } from "./engine";
import type { Explanation, ScanReport } from "./types";

// Per-instance hot cache in front of the DB cache, plus in-flight de-duplication.
const hot = new Map<string, { report: ScanReport; explanation: Explanation | null; exp: number }>();
const inflight = new Map<string, Promise<ScanReport>>();

export async function getCached(mint: string): Promise<{ report: ScanReport; explanation: Explanation | null } | null> {
  const h = hot.get(mint);
  if (h && h.exp > Date.now()) return h;
  try {
    const c = await repo().getCachedScan(mint);
    if (c && c.report.version === ENGINE_VERSION) {
      hot.set(mint, { ...c, exp: new Date(c.report.generatedAt).getTime() + SCAN_CACHE_TTL_MS });
      return c;
    }
  } catch (e) {
    logError("cache", e);
  }
  return null;
}

/** Runs a fresh scan (de-duplicated per mint) and caches it for 5 minutes. */
export async function runFreshScan(mint: string): Promise<ScanReport> {
  const existing = inflight.get(mint);
  if (existing) return existing;
  const p = (async () => {
    const snapshot = await collectSnapshot(mint);
    const report = buildReport(snapshot);
    const exp = Date.now() + SCAN_CACHE_TTL_MS;
    hot.set(mint, { report, explanation: null, exp });
    if (hot.size > 500) for (const [k, v] of hot) if (v.exp < Date.now()) hot.delete(k);
    try {
      await repo().putCachedScan(mint, report, new Date(exp));
    } catch (e) {
      logError("cache", e);
    }
    return report;
  })().finally(() => inflight.delete(mint));
  inflight.set(mint, p);
  return p;
}

export async function saveExplanation(mint: string, report: ScanReport, explanation: Explanation) {
  const h = hot.get(mint);
  if (h && h.report.generatedAt === report.generatedAt) h.explanation = explanation;
  try {
    await repo().putExplanation(mint, report.generatedAt, explanation);
  } catch (e) {
    logError("cache", e);
  }
}

export async function recordScan(
  report: ScanReport,
  who: { wallet: string | null; ipHash: string | null },
  via: "web" | "bulk" | "api" | "alert",
) {
  try {
    await repo().recordScan({
      mint: report.mint,
      name: report.token.name,
      symbol: report.token.symbol,
      score: report.score,
      label: report.label,
      wallet: who.wallet,
      ip_hash: who.ipHash,
      via,
    });
  } catch (e) {
    logError("recordScan", e);
  }
}
