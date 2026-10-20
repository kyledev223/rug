/** Pure helpers: report -> watch snapshot, and snapshot diff -> alerts. */
import type { ScanReport } from "@/lib/scan/types";
import type { Watchlist, WatchSnapshot } from "@/lib/db/types";
import { fmt } from "@/lib/scan/checks/util";
import { shortAddr } from "@/lib/solana/address";

export function toWatchSnapshot(r: ScanReport): WatchSnapshot {
  const status = (id: string) => r.checks.find((c) => c.id === id)?.status;
  const auth = (id: string) => {
    const s = status(id);
    return s === "fail" ? true : s === "pass" ? false : null;
  };
  const holdersOk = r.holders.length > 0;
  return {
    score: r.score,
    label: r.label,
    liquidityUsd: r.market.liquidityUsd,
    mintAuthority: auth("mint_authority"),
    freezeAuthority: auth("freeze_authority"),
    topHolders: holdersOk
      ? r.holders
          .filter((h) => h.counted && h.owner)
          .slice(0, 10)
          .map((h) => ({ owner: h.owner as string, pct: Math.round(h.pct * 100) / 100 }))
      : null,
    generatedAt: r.generatedAt,
  };
}

export type AlertKind = "risk_change" | "authority" | "liquidity_drop" | "holder_dump";

export interface PendingAlert {
  kind: AlertKind;
  message: string;
  details: Record<string, unknown>;
}

type Settings = Pick<Watchlist, "alert_score_change" | "alert_authority" | "alert_liquidity_drop_pct" | "alert_holder_dump_pct">;

export const SCORE_DELTA = 10;

export function diffSnapshots(prev: WatchSnapshot, next: WatchSnapshot, s: Settings, label: string): PendingAlert[] {
  const out: PendingAlert[] = [];

  if (s.alert_score_change && (prev.label !== next.label || Math.abs(next.score - prev.score) >= SCORE_DELTA)) {
    const dir = next.score > prev.score ? "increased" : "decreased";
    out.push({
      kind: "risk_change",
      message: `${label}: risk ${dir} ${prev.score} → ${next.score} (${prev.label} → ${next.label})`,
      details: { from: prev.score, to: next.score, fromLabel: prev.label, toLabel: next.label },
    });
  }

  if (s.alert_authority) {
    for (const [key, name] of [
      ["mintAuthority", "Mint authority"],
      ["freezeAuthority", "Freeze authority"],
    ] as const) {
      const a = prev[key];
      const b = next[key];
      if (a !== null && b !== null && a !== b) {
        out.push({
          kind: "authority",
          message: `${label}: ${name} ${b ? "is now ACTIVE" : "was revoked"}`,
          details: { authority: key, active: b },
        });
      }
    }
  }

  if (
    s.alert_liquidity_drop_pct > 0 &&
    prev.liquidityUsd !== null &&
    next.liquidityUsd !== null &&
    prev.liquidityUsd > 0 &&
    next.liquidityUsd < prev.liquidityUsd
  ) {
    const drop = ((prev.liquidityUsd - next.liquidityUsd) / prev.liquidityUsd) * 100;
    if (drop >= s.alert_liquidity_drop_pct) {
      out.push({
        kind: "liquidity_drop",
        message: `${label}: liquidity dropped ${drop.toFixed(0)}% (${fmt.usd(prev.liquidityUsd)} → ${fmt.usd(next.liquidityUsd)})`,
        details: { from: prev.liquidityUsd, to: next.liquidityUsd, dropPct: drop },
      });
    }
  }

  if (s.alert_holder_dump_pct > 0 && prev.topHolders && next.topHolders) {
    const floor = next.topHolders.length ? Math.min(...next.topHolders.map((h) => h.pct)) : 0;
    for (const h of prev.topHolders) {
      const now = next.topHolders.find((x) => x.owner === h.owner);
      // A holder that left the visible list now holds at most the smallest visible share.
      const nowPct = now ? now.pct : Math.min(floor, h.pct);
      const sold = h.pct - nowPct;
      if (sold >= s.alert_holder_dump_pct) {
        out.push({
          kind: "holder_dump",
          message: now
            ? `${label}: holder ${shortAddr(h.owner)} sold down ${fmt.pct(h.pct, 1)} → ${fmt.pct(nowPct, 1)} of supply`
            : `${label}: holder ${shortAddr(h.owner)} (${fmt.pct(h.pct, 1)}) left the top holders`,
          details: { owner: h.owner, from: h.pct, to: now ? now.pct : null },
        });
      }
    }
  }
  return out;
}

/** Only Discord webhooks are allowed (prevents using the server to call arbitrary URLs). */
export function isAllowedWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "discord.com" || u.hostname === "discordapp.com") &&
      /^\/api\/webhooks\/\d+\/[\w-]+$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
