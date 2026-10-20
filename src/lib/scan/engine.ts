/** Pure: TokenSnapshot -> ScanReport. No I/O here. */
import { ENGINE_VERSION } from "@/lib/config";
import type { CheckResult, PoolInfo, ScanReport, SourceStatus } from "./types";
import type { Fetched, TokenSnapshot } from "./snapshot";
import { freezeAuthorityCheck, mintAuthorityCheck } from "./checks/authorities";
import { token2022Check } from "./checks/token2022";
import { liquidityDepthCheck, lpStatusCheck, lpStatusFor, sortedPairs, totalLiquidity } from "./checks/liquidity";
import { classifyHolders, concentrationCheck } from "./checks/holders";
import { devHoldingsCheck, freshWalletsCheck, fundingClustersCheck } from "./checks/wallets";
import { marketActivityCheck, marketSummary, tokenAgeCheck, tradeBalanceCheck } from "./checks/market";
import { mutabilityCheck, socialsCheck } from "./checks/metadata";
import { computeScore } from "./score";

export const CHECKS: Array<(s: TokenSnapshot) => CheckResult> = [
  mintAuthorityCheck,
  freezeAuthorityCheck,
  token2022Check,
  liquidityDepthCheck,
  lpStatusCheck,
  concentrationCheck,
  fundingClustersCheck,
  freshWalletsCheck,
  devHoldingsCheck,
  tokenAgeCheck,
  marketActivityCheck,
  tradeBalanceCheck,
  mutabilityCheck,
  socialsCheck,
];

export function runChecks(s: TokenSnapshot): CheckResult[] {
  return CHECKS.map((fn) => fn(s));
}

function sourceStatuses(s: TokenSnapshot): SourceStatus[] {
  const all: Fetched<unknown>[] = [s.mintInfo, s.metadata, s.pairs, s.lp, s.largest, s.wallets, s.dev];
  const byName = new Map<string, SourceStatus>();
  for (const f of all) {
    const prev = byName.get(f.source);
    // A source is "ok" only if every request to it succeeded.
    if (!prev || (prev.ok && !f.ok)) {
      byName.set(f.source, { name: f.source, ok: f.ok, fetchedAt: f.at, ...(f.ok ? {} : { error: f.error }) });
    }
  }
  return [...byName.values()];
}

export function buildReport(s: TokenSnapshot): ScanReport {
  const checks = runChecks(s);
  const { score, label, coverage } = computeScore(checks);
  const pairs = s.pairs.ok ? s.pairs.data : [];
  const lpBy = new Map((s.lp.ok ? s.lp.data : []).map((l) => [l.pairAddress, l]));
  const pools: PoolInfo[] = sortedPairs(pairs).map((p) => ({
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    labels: p.labels,
    quoteSymbol: p.quoteSymbol,
    liquidityUsd: p.liquidityUsd,
    createdAt: p.createdAt,
    url: p.url,
    lp: lpStatusFor(p, lpBy.get(p.pairAddress)),
  }));
  const md = s.metadata.ok ? s.metadata.data : null;
  const mi = s.mintInfo.ok ? s.mintInfo.data : null;
  return {
    version: ENGINE_VERSION,
    mint: s.mint,
    generatedAt: new Date(s.now).toISOString(),
    token: {
      name: md?.name ?? mi?.inlineMetadata?.name ?? null,
      symbol: md?.symbol ?? mi?.inlineMetadata?.symbol ?? null,
      image: md?.image ?? null,
      decimals: mi?.decimals ?? 0,
      supply: mi?.supply ?? 0,
      program: mi?.program ?? "spl-token",
    },
    score,
    label,
    coverage,
    checks,
    holders: classifyHolders(s),
    pools,
    market: { ...marketSummary(pairs), liquidityUsd: totalLiquidity(pairs) },
    sources: sourceStatuses(s),
  };
}
