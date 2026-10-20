/**
 * Heuristic wallet-pattern checks. These look for patterns common in coordinated
 * launches but can produce false positives (e.g. an exchange funding many users).
 */
import type { CheckResult, Evidence } from "../types";
import type { TokenSnapshot, WalletProfile } from "../snapshot";
import { check, ev, fmt, unavailable } from "./util";

const CLUSTER = { id: "funding_clusters", title: "Shared funding source", category: "wallets", weight: 8, heuristic: true } as const;
const FRESH = { id: "fresh_wallets", title: "Fresh wallets among top holders", category: "wallets", weight: 5, heuristic: true } as const;
const DEV = { id: "dev_holdings", title: "Dev wallet holdings", category: "wallets", weight: 8, heuristic: true } as const;

export const FRESH_WINDOW_MS = 7 * 24 * 3600_000;
/** Wallets funded by the same source within this window are treated as a cluster. */
export const CLUSTER_WINDOW_MS = 72 * 3600_000;

export interface Cluster {
  funder: string;
  members: WalletProfile[];
  spanMs: number;
}

export function findClusters(profiles: WalletProfile[]): Cluster[] {
  const byFunder = new Map<string, WalletProfile[]>();
  for (const p of profiles) {
    if (!p.funder || p.fundedAt === null) continue;
    const list = byFunder.get(p.funder) ?? [];
    list.push(p);
    byFunder.set(p.funder, list);
  }
  const clusters: Cluster[] = [];
  for (const [funder, list] of byFunder) {
    // A top holder funding other top holders is the same cluster.
    const funderProfile = profiles.find((p) => p.owner === funder);
    const members = funderProfile ? [funderProfile, ...list] : list;
    const times = list.map((p) => p.fundedAt as number);
    const spanMs = Math.max(...times) - Math.min(...times);
    if (members.length >= 2 && spanMs <= CLUSTER_WINDOW_MS) clusters.push({ funder, members, spanMs });
  }
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

export function fundingClustersCheck(s: TokenSnapshot): CheckResult {
  const f = s.wallets;
  if (!f.ok) return unavailable(CLUSTER, f, "Wallet history");
  const determined = f.data.filter((p) => p.funder);
  // Wallets with 100+ transactions are long-lived; their first funder isn't traced,
  // but they are not the fresh, linked wallets this check looks for.
  const established = f.data.filter((p) => !p.reachedOldest);
  const assessable = determined.length + established.length;
  const clusters = findClusters(f.data);
  const evidence: Evidence[] = [
    ev(f, "Wallets with a traced first funder", `${determined.length} of ${f.data.length} profiled`),
    ev(f, "Established wallets (100+ txs, not traced)", String(established.length)),
  ];
  for (const c of clusters) {
    evidence.push(
      ev(f, `Funder of ${c.members.length} top holders (within ${fmt.age(c.spanMs || 60_000)})`, c.funder, { account: c.funder }),
    );
    for (const m of c.members) {
      if (m.owner === c.funder) continue;
      evidence.push(ev(f, "↳ funded wallet", m.owner, m.fundingSig ? { account: m.owner, tx: m.fundingSig } : { account: m.owner }));
    }
  }
  const biggest = clusters[0]?.members.length ?? 0;
  if (biggest >= 3) return check(CLUSTER, "fail", `${biggest} top holders were funded by the same wallet`, evidence);
  if (biggest === 2) return check(CLUSTER, "warn", "2 top holders were funded by the same wallet", evidence);
  if (assessable < 3 || assessable < f.data.length * 0.7)
    return check(CLUSTER, "unknown", "Too few wallets with a traceable history to judge", evidence);
  return check(CLUSTER, "pass", "No shared funding source found among profiled top holders", evidence);
}

export function freshWalletsCheck(s: TokenSnapshot): CheckResult {
  const f = s.wallets;
  if (!f.ok) return unavailable(FRESH, f, "Wallet history");
  if (f.data.length === 0) return check(FRESH, "unknown", "No wallet holders to profile", [ev(f, "Profiled wallets", "0")]);
  const fresh = f.data.filter((p) => p.reachedOldest && p.firstSeen !== null && s.now - p.firstSeen < FRESH_WINDOW_MS);
  const ratio = fresh.length / f.data.length;
  const evidence = [
    ev(f, "Fresh wallets (first tx < 7 days ago)", `${fresh.length} of ${f.data.length} profiled`),
    ...fresh.map((p) =>
      ev(f, `Fresh wallet, ${p.txCount} tx, first seen ${fmt.age(s.now - (p.firstSeen as number))} ago`, p.owner, {
        account: p.owner,
        ...(p.firstSig ? { tx: p.firstSig } : {}),
      }),
    ),
  ];
  if (fresh.length >= 3 && ratio >= 0.5)
    return check(FRESH, "fail", `${fresh.length} of ${f.data.length} top wallets are brand new`, evidence);
  if (fresh.length >= 2 && ratio >= 0.3)
    return check(FRESH, "warn", `${fresh.length} of ${f.data.length} top wallets are brand new`, evidence);
  return check(FRESH, "pass", `${fresh.length} of ${f.data.length} top wallets are brand new`, evidence);
}

export function devHoldingsCheck(s: TokenSnapshot): CheckResult {
  const f = s.dev;
  if (!f.ok) return unavailable(DEV, f, "Dev wallet data");
  if (!s.mintInfo.ok) return unavailable(DEV, s.mintInfo, "Mint supply");
  const supply = s.mintInfo.data.supply;
  if (f.data.length === 0)
    return check(DEV, "unknown", "No dev wallet identifiable (authorities revoked, no creator recorded)", [
      ev(f, "Candidates", "none"),
    ]);
  const rows = f.data.map((d) => ({ ...d, pct: supply > 0 ? (d.amount / supply) * 100 : 0 }));
  rows.sort((a, b) => b.pct - a.pct);
  const evidence = rows.map((r) => ev(f, `${r.role} holds`, `${fmt.pct(r.pct)} (${fmt.num(r.amount)} tokens)`, { account: r.address }));
  const top = rows[0];
  if (top.pct >= 10) return check(DEV, "fail", `Likely dev wallet (${top.role}) still holds ${fmt.pct(top.pct, 1)}`, evidence);
  if (top.pct >= 3) return check(DEV, "warn", `Likely dev wallet (${top.role}) holds ${fmt.pct(top.pct, 1)}`, evidence);
  return check(DEV, "pass", `Identified dev/authority wallets hold at most ${fmt.pct(top.pct, 2)}`, evidence);
}
