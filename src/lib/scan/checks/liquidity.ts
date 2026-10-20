import type { CheckResult, PoolInfo } from "../types";
import type { LpFacts, PairFacts, TokenSnapshot } from "../snapshot";
import { check, ev, fmt, unavailable } from "./util";

const DEPTH = { id: "liquidity_depth", title: "Liquidity depth", category: "liquidity", weight: 12 } as const;
const LP = { id: "lp_status", title: "LP burned / locked", category: "liquidity", weight: 10 } as const;

export function sortedPairs(pairs: PairFacts[]): PairFacts[] {
  return [...pairs].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

export function totalLiquidity(pairs: PairFacts[]): number | null {
  const vals = pairs.map((p) => p.liquidityUsd).filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

export function liquidityDepthCheck(s: TokenSnapshot): CheckResult {
  const f = s.pairs;
  if (!f.ok) return unavailable(DEPTH, f, "Pool data");
  if (f.data.length === 0) {
    return check(DEPTH, "fail", "No DEX pools found for this token", [ev(f, "Pools", "0")], 50);
  }
  const total = totalLiquidity(f.data);
  const top = sortedPairs(f.data)[0];
  const mcap = top.marketCap ?? top.fdv;
  const evidence = [
    ev(f, "Total liquidity (USD)", fmt.usd(total)),
    ev(f, "Pools", f.data.length >= 30 ? "30+ (API limit)" : String(f.data.length)),
    ev(f, "Largest pool", `${top.dexId} ${fmt.usd(top.liquidityUsd)}`, { account: top.pairAddress }),
  ];
  if (total === null) return check(DEPTH, "unknown", "Pools found but liquidity not reported", evidence);
  const ratio = mcap ? (total / mcap) * 100 : null;
  if (ratio !== null) evidence.push(ev(f, "Liquidity / market cap", fmt.pct(ratio)));
  if (total < 1_000) return check(DEPTH, "fail", `Very thin liquidity (${fmt.usd(total)}) — price is easy to move or drain`, evidence, 50);
  if (total < 10_000) return check(DEPTH, "warn", `Low liquidity (${fmt.usd(total)})`, evidence);
  // Large pools are naturally a small share of big market caps; only flag thin ones.
  if (ratio !== null && ratio < 2 && total < 100_000) return check(DEPTH, "warn", `Liquidity is only ${fmt.pct(ratio)} of market cap`, evidence);
  return check(DEPTH, "pass", `${fmt.usd(total)} liquidity across ${f.data.length} pool(s)`, evidence);
}

export function lpStatusFor(pair: PairFacts, lp: LpFacts | undefined): NonNullable<PoolInfo["lp"]> {
  if (pair.dexId === "pumpfun") {
    return { status: "bonding-curve", note: "Liquidity sits in the pump.fun bonding curve program; there are no LP tokens to withdraw" };
  }
  if (lp?.fungibleLp && lp.burnPercent !== null) {
    const b = lp.burnPercent;
    const base = { burnPercent: b, lpMint: lp.lpMint ?? undefined };
    if (b >= 95) return { ...base, status: "burned", note: `${b.toFixed(1)}% of LP tokens burned` };
    if (b >= 50) return { ...base, status: "partial", note: `Only ${b.toFixed(1)}% of LP tokens burned` };
    return { ...base, status: "unburned", note: `${b.toFixed(1)}% of LP tokens burned — the rest can be withdrawn unless locked elsewhere` };
  }
  const kind = pair.labels.join("/") || pair.dexId;
  return {
    status: "unknown",
    note: `${pair.dexId}${kind !== pair.dexId ? ` (${kind})` : ""} pool — LP burn/lock status not detectable automatically`,
  };
}

export function lpStatusCheck(s: TokenSnapshot): CheckResult {
  const f = s.pairs;
  if (!f.ok) return unavailable(LP, f, "Pool data");
  if (f.data.length === 0) return check(LP, "unknown", "No pools, so there is no LP to assess", [ev(f, "Pools", "0")]);
  const lpBy = new Map((s.lp.ok ? s.lp.data : []).map((l) => [l.pairAddress, l]));
  const pools = sortedPairs(f.data).slice(0, 5);
  const evidence = pools.map((p) => {
    const st = lpStatusFor(p, lpBy.get(p.pairAddress));
    const src = st.burnPercent !== undefined ? s.lp : f;
    return ev(src, `${p.dexId} ${p.quoteSymbol} pool (${fmt.usd(p.liquidityUsd)})`, `${st.status.toUpperCase()} — ${st.note}`, {
      account: p.pairAddress,
    });
  });
  if (!s.lp.ok) evidence.push(ev(s.lp, "Raydium API error", s.lp.error));
  const main = lpStatusFor(pools[0], lpBy.get(pools[0].pairAddress));
  switch (main.status) {
    case "burned":
      return check(LP, "pass", `Largest pool: ${main.note}`, evidence);
    case "bonding-curve":
      return check(LP, "pass", "Largest pool is a bonding curve — no LP tokens exist", evidence);
    case "partial":
      return check(LP, "warn", `Largest pool: ${main.note}`, evidence);
    case "unburned":
      return check(LP, "fail", `Largest pool: ${main.note}`, evidence);
    default:
      return check(LP, "unknown", `Largest pool: ${main.note}`, evidence);
  }
}
