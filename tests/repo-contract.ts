/**
 * Behaviour every Repo implementation must satisfy. Run against the in-memory
 * repo in CI (repo.test.ts); the Neon repo was verified against real Postgres with the same suite.
 */
import { expect, it } from "vitest";
import type { Repo, WatchSnapshot } from "@/lib/db/types";
import { buildReport } from "@/lib/scan/engine";
import { goodSnapshot } from "./fixtures/snapshots";

const W = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const OTHER = "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S";
const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

const snap: WatchSnapshot = {
  score: 20,
  label: "LOW",
  liquidityUsd: 1234.5,
  mintAuthority: false,
  freezeAuthority: null,
  topHolders: [{ owner: W, pct: 3.25 }],
  generatedAt: "2026-10-01T00:00:00.000Z",
};

export function repoContract(make: () => Repo | Promise<Repo>) {
  it("scan cache: put, get, explanation, expiry", async () => {
    const repo = await make();
    const report = buildReport({ ...goodSnapshot(), mint: MINT });
    expect(await repo.getCachedScan(MINT)).toBeNull();
    await repo.putCachedScan(MINT, report, new Date(Date.now() + 60_000));
    const got = await repo.getCachedScan(MINT);
    expect(got?.report.score).toBe(report.score);
    expect(got?.report.checks).toHaveLength(report.checks.length);
    expect(got?.explanation).toBeNull();
    await repo.putExplanation(MINT, "some-other-report", { source: "ai", overview: "x", checks: {}, generatedAt: "now" });
    expect((await repo.getCachedScan(MINT))?.explanation).toBeNull();
    await repo.putExplanation(MINT, report.generatedAt, { source: "ai", overview: "ok", checks: { a: "b" }, generatedAt: "now" });
    expect((await repo.getCachedScan(MINT))?.explanation?.overview).toBe("ok");
    await repo.putCachedScan("expired-mint", report, new Date(Date.now() - 1000));
    expect(await repo.getCachedScan("expired-mint")).toBeNull();
  });

  it("counters increment per window", async () => {
    const repo = await make();
    const start = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const exp = new Date(start.getTime() + 60_000);
    expect(await repo.getCounter("k1", start)).toBe(0);
    expect(await repo.incrCounter("k1", start, exp)).toBe(1);
    expect(await repo.incrCounter("k1", start, exp)).toBe(2);
    expect(await repo.getCounter("k1", start)).toBe(2);
    expect(await repo.incrCounter("k1", new Date(start.getTime() + 60_000), exp)).toBe(1);
  });

  it("scan log: recent (deduped per mint), history, latest, stats", async () => {
    const repo = await make();
    await repo.recordScan({ mint: MINT, name: "Bonk", symbol: "Bonk", score: 10, label: "LOW", wallet: W, ip_hash: "h", via: "web" });
    await new Promise((r) => setTimeout(r, 5));
    await repo.recordScan({ mint: MINT, name: "Bonk", symbol: "Bonk", score: 60, label: "HIGH", wallet: W, ip_hash: "h", via: "web" });
    await repo.recordScan({ mint: OTHER, name: null, symbol: null, score: 80, label: "CRITICAL", wallet: null, ip_hash: "h", via: "web" });
    await repo.recordScan({ mint: "alert-only", name: null, symbol: null, score: 5, label: "LOW", wallet: null, ip_hash: null, via: "alert" });
    const recent = await repo.recentScans(10);
    expect(recent.map((r) => r.mint).sort()).toEqual([MINT, OTHER].sort());
    expect(recent.find((r) => r.mint === MINT)?.score).toBe(60);
    expect(typeof recent[0].score).toBe("number");
    expect(Number.isNaN(Date.parse(recent[0].created_at))).toBe(false);
    const hist = await repo.scanHistory(W, 10);
    expect(hist).toHaveLength(2);
    expect(hist[0].score).toBe(60); // newest first
    expect((await repo.latestScanForMint(MINT))?.label).toBe("HIGH");
    expect(await repo.latestScanForMint("nope")).toBeNull();
    const s = await repo.stats();
    expect(s.total_scans).toBe(4);
    expect(s.scans_today).toBe(4);
    expect(s.flagged_today).toBe(2); // MINT (60) and OTHER (80)
  });

  it("nonces are single-use, wallet-bound and expire", async () => {
    const repo = await make();
    await repo.createNonce("n1", W, "msg-1", new Date(Date.now() + 60_000));
    expect(await repo.consumeNonce("n1", OTHER)).toBeNull();
    expect(await repo.consumeNonce("n1", W)).toBe("msg-1");
    expect(await repo.consumeNonce("n1", W)).toBeNull();
    await repo.createNonce("n2", W, "msg-2", new Date(Date.now() - 1000));
    expect(await repo.consumeNonce("n2", W)).toBeNull();
  });

  it("wallets upsert", async () => {
    const repo = await make();
    expect(await repo.getWallet(W)).toBeNull();
    await repo.upsertWallet({ address: W, tier: 1, balance: 150000.5, checked_at: new Date().toISOString() });
    await repo.upsertWallet({ address: W, tier: 2, balance: 2000000, checked_at: new Date().toISOString() });
    const w = await repo.getWallet(W);
    expect(w).toMatchObject({ address: W, tier: 2, balance: 2000000 });
  });

  it("watchlists: ownership, items, patch, stale queue, delete", async () => {
    const repo = await make();
    const list = await repo.createWatchlist(W, "mine");
    expect(list).toMatchObject({ name: "mine", alert_liquidity_drop_pct: 30, alert_holder_dump_pct: 5, webhook_url: null, items: [] });
    expect(await repo.addWatchItem(list.id, OTHER, { mint: MINT, name: null, symbol: null, snapshot: null })).toBe(false);
    expect(await repo.addWatchItem(list.id, W, { mint: MINT, name: "Bonk", symbol: "Bonk", snapshot: snap })).toBe(true);
    expect(await repo.addWatchItem(list.id, W, { mint: MINT, name: "Bonk", symbol: "Bonk", snapshot: snap })).toBe(true);
    expect(await repo.addWatchItem(list.id, W, { mint: OTHER, name: null, symbol: null, snapshot: null })).toBe(true);
    let lists = await repo.listWatchlists(W);
    expect(lists).toHaveLength(1);
    expect(lists[0].items.map((i) => i.mint)).toEqual([MINT, OTHER]);
    expect(lists[0].items[0].snapshot).toEqual(snap);
    expect(lists[0].items[0].checked_at).not.toBeNull();
    expect(await repo.listWatchlists(OTHER)).toEqual([]);

    expect(await repo.updateWatchlist(list.id, OTHER, { name: "hijack" })).toBe(false);
    expect(await repo.updateWatchlist(list.id, W, { alert_liquidity_drop_pct: 50, webhook_url: "https://discord.com/api/webhooks/1/a" })).toBe(true);
    lists = await repo.listWatchlists(W);
    expect(lists[0]).toMatchObject({ name: "mine", alert_liquidity_drop_pct: 50, alert_score_change: true, webhook_url: "https://discord.com/api/webhooks/1/a" });
    await repo.updateWatchlist(list.id, W, { webhook_url: null, alert_holder_dump_pct: 2.5 });
    lists = await repo.listWatchlists(W);
    expect(lists[0]).toMatchObject({ webhook_url: null, alert_holder_dump_pct: 2.5 });

    const stale = await repo.staleWatchItems(new Date(Date.now() + 1000), 10);
    expect(stale.map((s) => s.mint)[0]).toBe(OTHER); // never-checked first
    expect(stale[0].list).toMatchObject({ id: list.id, wallet: W, alert_liquidity_drop_pct: 50 });
    await repo.updateWatchItem(stale[0].id, snap, new Date());
    expect((await repo.staleWatchItems(new Date(Date.now() - 60_000), 10)).length).toBe(0);

    expect(await repo.removeWatchItem(list.id, OTHER, MINT)).toBe(false);
    expect(await repo.removeWatchItem(list.id, W, MINT)).toBe(true);
    expect((await repo.listWatchlists(W))[0].items.map((i) => i.mint)).toEqual([OTHER]);
    expect(await repo.deleteWatchlist(list.id, OTHER)).toBe(false);
    expect(await repo.deleteWatchlist(list.id, W)).toBe(true);
    expect(await repo.listWatchlists(W)).toEqual([]);
  });

  it("alerts: create, list newest first, mark read", async () => {
    const repo = await make();
    await repo.createAlert({ wallet: W, watchlist_id: null, mint: MINT, kind: "liquidity_drop", message: "first", details: { dropPct: 80 } });
    await new Promise((r) => setTimeout(r, 5));
    await repo.createAlert({ wallet: W, watchlist_id: null, mint: MINT, kind: "risk_change", message: "second", details: null });
    const a = await repo.listAlerts(W, 10);
    expect(a.map((x) => x.message)).toEqual(["second", "first"]);
    expect(a[1].details).toEqual({ dropPct: 80 });
    expect(a.every((x) => x.read_at === null)).toBe(true);
    await repo.markAlertsRead(W);
    expect((await repo.listAlerts(W, 10)).every((x) => x.read_at !== null)).toBe(true);
  });

  it("api keys: create, find by hash, revoke once, touch", async () => {
    const repo = await make();
    const k = await repo.createApiKey(W, "bot", "rc_live_abc123", "hash-1");
    expect(k).toMatchObject({ wallet: W, name: "bot", prefix: "rc_live_abc123", revoked_at: null, last_used_at: null });
    expect(JSON.stringify(k)).not.toContain("hash-1");
    expect((await repo.findApiKey("hash-1"))?.id).toBe(k.id);
    expect(await repo.findApiKey("nope")).toBeNull();
    await repo.touchApiKey(k.id);
    expect((await repo.findApiKey("hash-1"))?.last_used_at).not.toBeNull();
    expect(await repo.revokeApiKey(OTHER, k.id)).toBe(false);
    expect(await repo.revokeApiKey(W, k.id)).toBe(true);
    expect(await repo.revokeApiKey(W, k.id)).toBe(false);
    expect((await repo.listApiKeys(W))[0].revoked_at).not.toBeNull();
    await repo.prune();
  });
}
