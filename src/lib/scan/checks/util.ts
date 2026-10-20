import type { CheckCategory, CheckResult, CheckStatus, Evidence } from "../types";
import type { Fetched } from "../snapshot";

export function ev(
  f: Pick<Fetched<unknown>, "source" | "at">,
  label: string,
  value: string,
  extra: { account?: string; tx?: string } = {},
): Evidence {
  return { label, value, source: f.source, observedAt: f.at, ...extra };
}

export function check(
  base: { id: string; title: string; category: CheckCategory; weight: number; heuristic?: boolean },
  status: CheckStatus,
  summary: string,
  evidence: Evidence[],
  floor?: number,
): CheckResult {
  return { ...base, status, summary, evidence, ...(floor !== undefined && status === "fail" ? { floor } : {}) };
}

/** Standard "data source failed" result: unknown, never pass. */
export function unavailable(
  base: { id: string; title: string; category: CheckCategory; weight: number; heuristic?: boolean },
  f: Fetched<unknown>,
  what = "Data",
): CheckResult {
  const msg = f.ok ? "" : f.error;
  return check(base, "unknown", `${what} unavailable — could not verify`, [ev(f, "Source error", msg || "no data")]);
}

export function worst(statuses: CheckStatus[]): CheckStatus {
  const order: CheckStatus[] = ["fail", "warn", "unknown", "pass"];
  for (const s of order) if (statuses.includes(s)) return s;
  return "pass";
}

export const fmt = {
  usd(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `$${n.toPrecision(3)}`;
  },
  pct(n: number | null | undefined, digits = 2): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
    return `${n.toFixed(digits)}%`;
  },
  num(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  },
  age(ms: number): string {
    const m = Math.floor(ms / 60_000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 365) return `${d}d`;
    return `${(d / 365).toFixed(1)}y`;
  },
};
