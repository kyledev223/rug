import type { CheckResult, HolderRow } from "../types";
import type { TokenSnapshot } from "../snapshot";
import { KNOWN_OWNERS } from "@/lib/sources/known-accounts";
import { check, ev, fmt, unavailable } from "./util";

const BASE = { id: "holder_concentration", title: "Holder concentration", category: "holders", weight: 14 } as const;

/** Label each large holder; pools and burn addresses are excluded from concentration. */
export function classifyHolders(s: TokenSnapshot): HolderRow[] {
  if (!s.largest.ok || !s.mintInfo.ok) return [];
  const supply = s.mintInfo.data.supply;
  const pairs = new Map((s.pairs.ok ? s.pairs.data : []).map((p) => [p.pairAddress, p]));
  return s.largest.data.map((a) => {
    const pct = supply > 0 ? (a.amount / supply) * 100 : 0;
    const base = { tokenAccount: a.tokenAccount, owner: a.owner, amount: a.amount, pct };
    const known = a.owner ? KNOWN_OWNERS[a.owner] : undefined;
    if (known) return { ...base, kind: known.kind, label: known.label, counted: known.kind !== "pool" && known.kind !== "burn" };
    const pair = a.owner ? pairs.get(a.owner) : undefined;
    if (pair) return { ...base, kind: "pool", label: `${pair.dexId} pool (${pair.quoteSymbol})`, counted: false };
    if (a.ownerOnCurve === false) return { ...base, kind: "pda", label: "Program-owned (PDA) — locker, vesting or unlisted pool?", counted: true };
    return { ...base, kind: "wallet", counted: true };
  });
}

export function concentration(rows: HolderRow[]) {
  const counted = rows.filter((r) => r.counted);
  const sum = (n: number) => counted.slice(0, n).reduce((a, r) => a + r.pct, 0);
  return { top1: sum(1), top10: sum(10), top20: sum(20), counted };
}

export function concentrationCheck(s: TokenSnapshot): CheckResult {
  if (!s.mintInfo.ok) return unavailable(BASE, s.mintInfo, "Mint supply");
  const f = s.largest;
  if (!f.ok) return unavailable(BASE, f, "Holder data");
  const rows = classifyHolders(s);
  if (rows.length === 0) return check(BASE, "unknown", "No holder accounts returned", [ev(f, "Largest accounts", "0")]);
  const { top1, top10, top20, counted } = concentration(rows);
  const excluded = rows.filter((r) => !r.counted);
  const evidence = [
    ev(f, "Top 1 holder (excl. pools/burn)", fmt.pct(top1), counted[0]?.owner ? { account: counted[0].owner } : {}),
    ev(f, "Top 10 holders", fmt.pct(top10)),
    ev(f, "Top 20 holders", fmt.pct(top20)),
    ...excluded.map((r) =>
      ev(f, `Excluded: ${r.label ?? r.kind}`, fmt.pct(r.pct), r.owner ? { account: r.owner } : { account: r.tokenAccount }),
    ),
  ];
  if (top1 > 20 || top10 > 50)
    return check(BASE, "fail", `Highly concentrated: top holder ${fmt.pct(top1, 1)}, top 10 ${fmt.pct(top10, 1)}`, evidence);
  if (top1 > 10 || top10 > 30 || top20 > 60)
    return check(BASE, "warn", `Concentrated: top holder ${fmt.pct(top1, 1)}, top 10 ${fmt.pct(top10, 1)}`, evidence);
  return check(BASE, "pass", `Distributed: top holder ${fmt.pct(top1, 1)}, top 10 ${fmt.pct(top10, 1)}`, evidence);
}
