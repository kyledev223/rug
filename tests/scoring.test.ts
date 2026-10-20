import { describe, expect, it } from "vitest";
import { buildReport, runChecks, CHECKS } from "@/lib/scan/engine";
import { computeScore, labelFor, STATUS_PENALTY } from "@/lib/scan/score";
import { classifyHolders, concentration } from "@/lib/scan/checks/holders";
import { findClusters } from "@/lib/scan/checks/wallets";
import { assessExtension } from "@/lib/scan/checks/token2022";
import { lpStatusCheck } from "@/lib/scan/checks/liquidity";
import { tradeBalanceCheck } from "@/lib/scan/checks/market";
import { templateExplanation } from "@/lib/scan/explain";
import type { CheckResult } from "@/lib/scan/types";
import { A, NOW, badSnapshot, goodSnapshot, ok, outageSnapshot } from "./fixtures/snapshots";

const byId = (checks: CheckResult[], id: string) => {
  const c = checks.find((x) => x.id === id);
  if (!c) throw new Error(`missing check ${id}`);
  return c;
};

describe("known-good token profile", () => {
  const report = buildReport(goodSnapshot());

  it("scores LOW with every check passing", () => {
    const notPassing = report.checks.filter((c) => c.status !== "pass").map((c) => `${c.id}:${c.status}`);
    expect(notPassing).toEqual([]);
    expect(report.score).toBe(0);
    expect(report.label).toBe("LOW");
    expect(report.coverage).toBe(100);
  });

  it("excludes pool and burn accounts from concentration and labels them", () => {
    const pool = report.holders.find((h) => h.owner === A.rayAuth);
    const burn = report.holders.find((h) => h.owner === A.burn);
    const orca = report.holders.find((h) => h.owner === A.pool1);
    expect(pool).toMatchObject({ kind: "pool", counted: false, label: "Raydium AMM v4 authority" });
    expect(burn).toMatchObject({ kind: "burn", counted: false });
    expect(orca).toMatchObject({ kind: "pool", counted: false });
    const { top1, top10 } = concentration(report.holders);
    expect(top1).toBeCloseTo(2, 5); // 20M of 1B
    expect(top10).toBeCloseTo(15.5, 5);
  });

  it("reports pools sorted by liquidity with LP status", () => {
    expect(report.pools[0].pairAddress).toBe(A.pool2);
    expect(report.pools[0].lp?.status).toBe("burned");
    expect(report.pools[1].lp?.status).toBe("unknown"); // orca whirlpool: not detectable
    expect(report.market.liquidityUsd).toBe(1_200_000);
  });
});

describe("known-bad token profile", () => {
  const report = buildReport(badSnapshot());
  const c = (id: string) => byId(report.checks, id);

  it("scores CRITICAL", () => {
    expect(report.label).toBe("CRITICAL");
    expect(report.score).toBeGreaterThanOrEqual(75);
  });

  it("fails the expected checks", () => {
    for (const id of [
      "mint_authority",
      "freeze_authority",
      "token2022_extensions",
      "liquidity_depth",
      "lp_status",
      "holder_concentration",
      "funding_clusters",
      "fresh_wallets",
      "dev_holdings",
      "token_age",
      "trade_balance",
    ]) {
      expect(c(id).status, id).toBe("fail");
    }
    expect(c("metadata_mutable").status).toBe("warn");
    expect(c("socials").status).toBe("warn");
    expect(c("market_activity").status).toBe("warn");
  });

  it("every warning and failure carries evidence with source and timestamp", () => {
    for (const chk of report.checks.filter((x) => x.status !== "pass")) {
      expect(chk.evidence.length, chk.id).toBeGreaterThan(0);
      for (const e of chk.evidence) {
        expect(e.source, chk.id).toBeTruthy();
        expect(Number.isNaN(Date.parse(e.observedAt)), chk.id).toBe(false);
      }
    }
  });

  it("links the accounts involved", () => {
    expect(c("mint_authority").evidence[0].account).toBe(A.dev);
    const t22 = c("token2022_extensions").evidence.find((e) => e.label === "permanentDelegate");
    expect(t22?.account).toBe(A.dev);
    const cluster = c("funding_clusters").evidence.find((e) => e.account === A.funder);
    expect(cluster).toBeDefined();
  });

  it("detects the funding cluster including a top holder funded by the same source", () => {
    const w = badSnapshot().wallets;
    if (!w.ok) throw new Error("fixture");
    const clusters = findClusters(w.data);
    expect(clusters[0].funder).toBe(A.funder);
    expect(clusters[0].members.length).toBe(5); // dev + 4 wallets
  });
});

describe("unknown never counts as pass", () => {
  const report = buildReport(outageSnapshot());

  it("marks checks with failed sources as unknown", () => {
    for (const id of ["liquidity_depth", "lp_status", "holder_concentration", "funding_clusters", "token_age", "socials"]) {
      expect(byId(report.checks, id).status, id).toBe("unknown");
    }
  });

  it("produces a non-zero score and reduced coverage", () => {
    expect(report.score).toBeGreaterThan(0);
    expect(report.coverage).toBeLessThan(50);
    expect(report.sources.find((s) => s.name === "DexScreener")?.ok).toBe(false);
  });

  it("unknown penalty is strictly greater than pass", () => {
    expect(STATUS_PENALTY.unknown).toBeGreaterThan(STATUS_PENALTY.pass);
  });
});

describe("computeScore", () => {
  const mk = (status: CheckResult["status"], weight: number, floor?: number): CheckResult => ({
    id: `c${Math.random()}`,
    title: "t",
    category: "market",
    status,
    weight,
    summary: "",
    evidence: [],
    ...(floor !== undefined ? { floor } : {}),
  });

  it("weights penalties and normalizes to 0-100", () => {
    expect(computeScore([mk("pass", 10), mk("fail", 10)]).score).toBe(50);
    expect(computeScore([mk("warn", 10), mk("pass", 30)]).score).toBe(13); // 5/40
    expect(computeScore([mk("unknown", 10)]).score).toBe(40);
  });

  it("applies hard-flag floors only when the check fails", () => {
    const r = computeScore([mk("fail", 1, 75), mk("pass", 99)]);
    expect(r.weighted).toBe(1);
    expect(r.score).toBe(75);
    expect(r.label).toBe("CRITICAL");
    expect(r.floorApplied?.floor).toBe(75);
  });

  it("maps label bands", () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(labelFor)).toEqual([
      "LOW",
      "LOW",
      "MEDIUM",
      "MEDIUM",
      "HIGH",
      "HIGH",
      "CRITICAL",
      "CRITICAL",
    ]);
  });

  it("treats an empty check list as maximum risk", () => {
    expect(computeScore([]).label).toBe("CRITICAL");
  });
});

describe("individual rules", () => {
  it("Token-2022 extension assessment", () => {
    expect(assessExtension("permanentDelegate", { delegate: A.dev }).status).toBe("fail");
    expect(assessExtension("transferHook", { programId: A.dev, authority: null }).status).toBe("fail");
    expect(assessExtension("transferHook", { programId: null, authority: A.dev }).status).toBe("warn");
    expect(assessExtension("transferFeeConfig", { newerTransferFee: { transferFeeBasisPoints: 0 } }).status).toBe("pass");
    expect(
      assessExtension("transferFeeConfig", { newerTransferFee: { transferFeeBasisPoints: 0 }, transferFeeConfigAuthority: A.dev })
        .status,
    ).toBe("warn");
    expect(assessExtension("defaultAccountState", { accountState: "frozen" }).status).toBe("fail");
    expect(assessExtension("nonTransferable").status).toBe("fail");
    expect(assessExtension("metadataPointer").status).toBe("pass");
    expect(assessExtension("someFutureExtension").status).toBe("warn");
  });

  it("unidentified program-owned holders still count toward concentration", () => {
    const s = goodSnapshot();
    s.largest = ok("Solana RPC", [{ tokenAccount: A.w[0], owner: A.w[1], ownerOnCurve: false, amount: 300_000_000 }]);
    const rows = classifyHolders(s);
    expect(rows[0]).toMatchObject({ kind: "pda", counted: true });
  });

  it("zero sells with many buys is a honeypot signal with a CRITICAL floor", () => {
    const r = tradeBalanceCheck(badSnapshot());
    expect(r.status).toBe("fail");
    expect(r.floor).toBe(75);
  });

  it("bonding-curve pools pass LP check; concentrated pools are unknown", () => {
    const s = goodSnapshot();
    if (!s.pairs.ok) throw new Error();
    s.pairs.data[0].dexId = "pumpfun";
    expect(lpStatusCheck(s).status).toBe("pass");
    s.pairs.data[0].dexId = "meteora";
    s.lp = ok("Raydium API", []);
    expect(lpStatusCheck(s).status).toBe("unknown");
  });

  it("wallets funded by the same source far apart are not a cluster", () => {
    const base = { reachedOldest: true, txCount: 2, firstSeen: NOW, firstSig: null, fundingSig: null };
    const clusters = findClusters([
      { ...base, owner: A.w[0], funder: A.funder, fundedAt: NOW - 30 * 24 * 3600_000 },
      { ...base, owner: A.w[1], funder: A.funder, fundedAt: NOW },
    ]);
    expect(clusters).toEqual([]);
  });
});

describe("template explanations", () => {
  it("cover every check and never call a token safe", () => {
    for (const snap of [goodSnapshot(), badSnapshot(), outageSnapshot()]) {
      const r = buildReport(snap);
      const ex = templateExplanation(r);
      expect(Object.keys(ex.checks).sort()).toEqual(r.checks.map((c) => c.id).sort());
      const all = [ex.overview, ...Object.values(ex.checks)].join(" ");
      expect(all).not.toMatch(/\b(is|looks) safe\b/i);
      expect(ex.overview).toContain(r.label);
    }
  });

  it("engine runs all registered checks", () => {
    expect(runChecks(goodSnapshot()).length).toBe(CHECKS.length);
  });
});
