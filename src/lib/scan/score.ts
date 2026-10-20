import type { CheckResult, CheckStatus, RiskLabel } from "./types";

/**
 * Risk contribution per status. "unknown" is deliberately > 0:
 * missing data never counts as a pass.
 */
export const STATUS_PENALTY: Record<CheckStatus, number> = {
  pass: 0,
  unknown: 0.4,
  warn: 0.5,
  fail: 1,
};

export const LABEL_BANDS: Array<{ min: number; label: RiskLabel }> = [
  { min: 75, label: "CRITICAL" },
  { min: 50, label: "HIGH" },
  { min: 25, label: "MEDIUM" },
  { min: 0, label: "LOW" },
];

export function labelFor(score: number): RiskLabel {
  return LABEL_BANDS.find((b) => score >= b.min)!.label;
}

export interface ScoreResult {
  score: number;
  label: RiskLabel;
  coverage: number;
  /** Weighted score before hard-flag floors were applied. */
  weighted: number;
  floorApplied: { checkId: string; floor: number } | null;
}

export function computeScore(checks: CheckResult[]): ScoreResult {
  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return { score: 100, label: "CRITICAL", coverage: 0, weighted: 100, floorApplied: null };

  const penalty = checks.reduce((a, c) => a + c.weight * STATUS_PENALTY[c.status], 0);
  const weighted = Math.round((penalty / totalWeight) * 100);

  // Hard red flags (e.g. permanent delegate, honeypot signal) set a minimum score.
  let floorApplied: ScoreResult["floorApplied"] = null;
  for (const c of checks) {
    if (c.status === "fail" && c.floor !== undefined && c.floor > (floorApplied?.floor ?? -1)) {
      floorApplied = { checkId: c.id, floor: c.floor };
    }
  }
  const score = Math.min(100, Math.max(weighted, floorApplied?.floor ?? 0));
  const known = checks.filter((c) => c.status !== "unknown").reduce((a, c) => a + c.weight, 0);
  return {
    score,
    label: labelFor(score),
    coverage: Math.round((known / totalWeight) * 100),
    weighted,
    floorApplied: floorApplied && floorApplied.floor > weighted ? floorApplied : null,
  };
}
