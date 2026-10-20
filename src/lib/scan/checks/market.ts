import type { CheckResult } from "../types";
import type { PairFacts, TokenSnapshot } from "../snapshot";
import { check, ev, fmt, unavailable } from "./util";
import { sortedPairs } from "./liquidity";

const AGE = { id: "token_age", title: "Token age", category: "market", weight: 4 } as const;
const ACTIVITY = { id: "market_activity", title: "Market cap & volume", category: "market", weight: 4 } as const;
const TRADES = { id: "trade_balance", title: "Buy / sell balance (24h)", category: "market", weight: 6 } as const;

export function marketSummary(pairs: PairFacts[]) {
  const sorted = sortedPairs(pairs);
  const top = sorted[0];
  const sum = (k: "volume24h" | "buys24h" | "sells24h") => {
    const v = pairs.map((p) => p[k]).filter((x): x is number => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const created = pairs.map((p) => p.createdAt).filter((x): x is number => typeof x === "number");
  return {
    priceUsd: top?.priceUsd ?? null,
    marketCapUsd: top?.marketCap ?? null,
    fdvUsd: top?.fdv ?? null,
    volume24hUsd: sum("volume24h"),
    buys24h: sum("buys24h"),
    sells24h: sum("sells24h"),
    createdAt: created.length ? Math.min(...created) : null,
  };
}

export function tokenAgeCheck(s: TokenSnapshot): CheckResult {
  const f = s.pairs;
  if (!f.ok) return unavailable(AGE, f, "Pool data");
  const { createdAt } = marketSummary(f.data);
  if (createdAt === null) return check(AGE, "unknown", "No pool creation time available", [ev(f, "First pool created", "n/a")]);
  const age = s.now - createdAt;
  const evidence = [ev(f, "First pool created", `${new Date(createdAt).toISOString()} (${fmt.age(age)} ago)`)];
  if (age < 3600_000) return check(AGE, "fail", `Brand new: first pool is ${fmt.age(age)} old`, evidence);
  if (age < 72 * 3600_000) return check(AGE, "warn", `Young token: first pool is ${fmt.age(age)} old`, evidence);
  return check(AGE, "pass", `First pool is ${fmt.age(age)} old`, evidence);
}

export function marketActivityCheck(s: TokenSnapshot): CheckResult {
  const f = s.pairs;
  if (!f.ok) return unavailable(ACTIVITY, f, "Pool data");
  const m = marketSummary(f.data);
  const mcap = m.marketCapUsd ?? m.fdvUsd;
  const evidence = [ev(f, "Market cap", fmt.usd(mcap)), ev(f, "24h volume (all pools)", fmt.usd(m.volume24hUsd))];
  if (mcap === null && m.volume24hUsd === null) return check(ACTIVITY, "unknown", "No market data reported", evidence);
  const issues: string[] = [];
  if (mcap !== null && mcap < 50_000) issues.push(`tiny market cap (${fmt.usd(mcap)})`);
  if (m.volume24hUsd !== null && m.volume24hUsd < 1_000) issues.push(`almost no 24h volume (${fmt.usd(m.volume24hUsd)})`);
  if (issues.length) return check(ACTIVITY, "warn", issues.join("; "), evidence);
  return check(ACTIVITY, "pass", `Market cap ${fmt.usd(mcap)}, 24h volume ${fmt.usd(m.volume24hUsd)}`, evidence);
}

export function tradeBalanceCheck(s: TokenSnapshot): CheckResult {
  const f = s.pairs;
  if (!f.ok) return unavailable(TRADES, f, "Pool data");
  const { buys24h: buys, sells24h: sells } = marketSummary(f.data);
  const evidence = [ev(f, "24h buys", fmt.num(buys)), ev(f, "24h sells", fmt.num(sells))];
  if (buys === null || sells === null) return check(TRADES, "unknown", "No transaction counts reported", evidence);
  if (buys + sells < 20) return check(TRADES, "unknown", `Too few trades in 24h to judge (${buys + sells})`, evidence);
  if (sells === 0)
    return check(TRADES, "fail", `${buys} buys and zero sells in 24h — possible honeypot (selling may be blocked)`, evidence, 75);
  const ratio = buys / sells;
  evidence.push(ev(f, "Buy/sell ratio", ratio.toFixed(2)));
  if (ratio > 5) return check(TRADES, "warn", `Very lopsided trading: ${ratio.toFixed(1)}× more buys than sells`, evidence);
  if (ratio < 0.2) return check(TRADES, "warn", `Heavy selling: ${(1 / ratio).toFixed(1)}× more sells than buys`, evidence);
  return check(TRADES, "pass", `Buy/sell ratio ${ratio.toFixed(2)} over ${buys + sells} trades`, evidence);
}
