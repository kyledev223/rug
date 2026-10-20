import type { ReactNode } from "react";
import type { CheckStatus, RiskLabel } from "@/lib/scan/types";
import { LINKS } from "@/lib/config";
import { shortAddr } from "@/lib/solana/address";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

const RISK_STYLE: Record<RiskLabel, string> = {
  LOW: "border-ink text-ink bg-paper",
  MEDIUM: "border-amber-line text-amber bg-amber-bg",
  HIGH: "border-red text-red-dark bg-red-tint",
  CRITICAL: "border-red bg-red text-white animate-pulse-red",
};

export function RiskBadge({ label, size = "md" }: { label: RiskLabel; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 border font-mono font-bold tracking-widest uppercase",
        size === "sm" && "px-1.5 py-0 text-[10px] rounded-[2px]",
        size === "md" && "px-2 py-0.5 text-xs rounded-[3px]",
        size === "lg" && "px-3 py-1 text-sm rounded-[3px]",
        RISK_STYLE[label],
      )}
    >
      <span aria-hidden className={cx("size-1.5 rounded-full", label === "CRITICAL" ? "bg-white" : "bg-current")} />
      {label}
    </span>
  );
}

const STATUS_STYLE: Record<CheckStatus, { cls: string; text: string; glyph: string }> = {
  pass: { cls: "text-ok bg-ok-bg border-ok/30", text: "PASS", glyph: "✓" },
  warn: { cls: "text-amber bg-amber-bg border-amber-line/50", text: "WARN", glyph: "!" },
  fail: { cls: "text-white bg-red border-red", text: "FAIL", glyph: "×" },
  unknown: { cls: "text-muted bg-paper-2 border-line-2", text: "UNKNOWN", glyph: "?" },
};

export function StatusPill({ status }: { status: CheckStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cx("inline-flex min-w-[76px] items-center justify-center gap-1 rounded-[2px] border px-1.5 text-[11px] font-bold tracking-wider", s.cls)}>
      <span aria-hidden>{s.glyph}</span>
      {s.text}
    </span>
  );
}

export function statusWord(s: CheckStatus) {
  return STATUS_STYLE[s].text;
}

export function SectionLabel({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="label-num">
      {n} · {children}
    </p>
  );
}

export function Addr({ address, kind = "account", chars = 4, className }: { address: string; kind?: "account" | "token" | "tx"; chars?: number; className?: string }) {
  const href = kind === "token" ? LINKS.solscanToken(address) : kind === "tx" ? LINKS.solscanTx(address) : LINKS.solscanAccount(address);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx("link font-mono break-all", className)} title={`${address} — open on Solscan`}>
      {shortAddr(address, chars)}
      <span className="sr-only"> (opens Solscan)</span>
    </a>
  );
}

export function LiveDot({ label = "live", tone = "red" }: { label?: string; tone?: "red" | "gray" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted">
      <span aria-hidden className={cx("relative inline-flex size-2 rounded-full", tone === "red" ? "bg-red" : "bg-faint")}>
        {tone === "red" && <span className="absolute inset-0 animate-ping rounded-full bg-red opacity-60 motion-reduce:hidden" />}
      </span>
      {label}
    </span>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-[3px] border border-red bg-red px-4 py-2.5 font-mono text-sm font-bold text-white transition-colors hover:bg-red-dark hover:border-red-dark disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-[3px] border border-line-2 bg-paper px-3 py-2 font-mono text-sm text-ink transition-colors hover:border-red hover:text-red-dark disabled:opacity-50 disabled:cursor-not-allowed",
  small:
    "inline-flex items-center justify-center gap-1.5 rounded-[3px] border border-line-2 bg-paper px-2 py-1 font-mono text-xs text-ink transition-colors hover:border-red hover:text-red-dark disabled:opacity-50",
};

export function Prompt() {
  return (
    <span aria-hidden className="text-red">
      &gt;_
    </span>
  );
}
