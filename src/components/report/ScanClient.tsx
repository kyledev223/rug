"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Explanation, ScanReport } from "@/lib/scan/types";
import { APP_NAME, APP_SHORT } from "@/lib/config";
import { ReportBody, ReportHeader } from "./ReportView";
import { btn, cx, statusWord } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";

type Phase = "loading" | "printing" | "done" | "error";
interface ApiError {
  code: string;
  message: string;
  resetAt?: string;
}

interface Line {
  text: string;
  tone?: "pass" | "warn" | "fail" | "unknown" | "dim" | "head";
}

function buildLines(r: ScanReport, cached: boolean): Line[] {
  const lines: Line[] = [
    { text: `> ${APP_SHORT} scan ${r.mint}`, tone: "head" },
    { text: cached ? "  cache hit (≤5 min old) — replaying result" : "  fetched fresh data", tone: "dim" },
    ...r.sources.map((s) => ({ text: `  source ${s.name.padEnd(12)} ${s.ok ? "ok" : `DEGRADED (${s.error ?? "error"})`}`, tone: (s.ok ? "dim" : "warn") as Line["tone"] })),
    { text: `  token ${r.token.name ?? "unknown"} ${r.token.symbol ? `($${r.token.symbol})` : ""}`, tone: "dim" },
  ];
  for (const c of r.checks) {
    lines.push({ text: `  [${statusWord(c.status).padEnd(7)}] ${c.title} — ${c.summary}`, tone: c.status });
  }
  lines.push({ text: `> risk score ${r.score}/100 · ${r.label} · coverage ${r.coverage}%`, tone: "head" });
  return lines;
}

const TONE: Record<NonNullable<Line["tone"]>, string> = {
  head: "text-ink font-bold",
  dim: "text-muted",
  pass: "text-ok",
  warn: "text-amber",
  fail: "text-red-dark font-bold",
  unknown: "text-faint",
};

function Terminal({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-paper-2 px-3 py-1.5 text-[11px] text-muted">
        <span aria-hidden className="flex gap-1">
          <span className="size-2 rounded-full bg-red" />
          <span className="size-2 rounded-full bg-line-2" />
          <span className="size-2 rounded-full bg-line-2" />
        </span>
        <span className="truncate">{title}</span>
      </div>
      <div className="scroll-x p-3 font-mono text-xs leading-relaxed sm:p-4 sm:text-[13px]">{children}</div>
    </div>
  );
}

export function ScanClient({ mint, actions }: { mint: string; actions?: (r: ScanReport) => ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [report, setReport] = useState<ScanReport | null>(null);
  const [cached, setCached] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [shown, setShown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);

  const run = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setShown(0);
    started.current = performance.now();
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.report) {
        setError(body?.error ?? { code: "network", message: "The scanner could not be reached. Check your connection and try again." });
        setPhase("error");
        return;
      }
      setReport(body.report);
      setExplanation(body.explanation);
      setCached(Boolean(body.cached));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setPhase(reduce ? "done" : "printing");
    } catch {
      setError({ code: "network", message: "The scanner could not be reached. Check your connection and try again." });
      setPhase("error");
    }
  }, [mint]);

  // Scan once per mint. The ref survives StrictMode's double effect run and
  // Activity re-shows, so neither burns an extra daily-quota unit.
  const ranFor = useRef<string | null>(null);
  useEffect(() => {
    if (ranFor.current === mint) return;
    ranFor.current = mint;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
  }, [run, mint]);

  // Real elapsed timer while waiting on the server.
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setInterval(() => setElapsed((performance.now() - started.current) / 1000), 100);
    return () => clearInterval(t);
  }, [phase]);

  const lines = useMemo(() => (report ? buildLines(report, cached) : []), [report, cached]);

  // Print terminal lines one by one, then settle into the report.
  useEffect(() => {
    if (phase !== "printing") return;
    if (shown >= lines.length) {
      const t = setTimeout(() => setPhase("done"), 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => n + 1), shown < 4 ? 90 : 60);
    return () => clearTimeout(t);
  }, [phase, shown, lines.length]);

  // Upgrade to an AI explanation in the background (falls back silently).
  useEffect(() => {
    if (phase !== "done" || !report || explanation?.source === "ai") return;
    let cancelled = false;
    fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!cancelled && b?.explanation?.source === "ai") setExplanation(b.explanation);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, report, mint]);

  if (phase === "error" && error) return <ScanError error={error} onRetry={run} />;

  if (phase === "loading") {
    return (
      <Terminal title={`${APP_SHORT} — scanning`}>
        <p className="font-bold">&gt; {APP_SHORT} scan {mint}</p>
        <p className="text-muted">  querying Solana RPC, DexScreener, Raydium and metadata sources…</p>
        <p className="text-muted" aria-live="polite">
          {"  "}elapsed {elapsed.toFixed(1)}s <span className="animate-blink text-red motion-reduce:animate-none">█</span>
        </p>
      </Terminal>
    );
  }

  if (!report || !explanation) return null;

  if (phase === "printing") {
    return (
      <div>
        <Terminal title={`${APP_SHORT} — ${report.token.symbol ?? "scan"}`}>
          {lines.slice(0, shown).map((l, i) => (
            <p key={i} className={cx("animate-line-in whitespace-pre", TONE[l.tone ?? "dim"])}>
              {l.text}
            </p>
          ))}
          <span className="animate-blink text-red">█</span>
        </Terminal>
        <button type="button" className={cx(btn.small, "mt-2")} onClick={() => setPhase("done")}>
          skip ▸
        </button>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${report.token.symbol ? `$${report.token.symbol}` : "This token"} scored ${report.score}/100 (${report.label}) on ${APP_NAME}.`;
  return (
    <div className="animate-line-in space-y-6">
      <ReportHeader
        report={report}
        actions={
          <>
            <button type="button" className={btn.small} onClick={run}>
              ↻ rescan
            </button>
            <CopyButton value={shareUrl} label="copy link" />
            <a
              className={btn.small}
              href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              share on X ↗
            </a>
            {actions?.(report)}
            {cached && <span className="self-center text-[11px] text-faint">cached result · max 5 min old</span>}
          </>
        }
      />
      <details className="card px-4 py-2 text-xs">
        <summary className="cursor-pointer text-muted select-none">scan log</summary>
        <div className="scroll-x py-2">
          {lines.map((l, i) => (
            <p key={i} className={cx("whitespace-pre", TONE[l.tone ?? "dim"])}>
              {l.text}
            </p>
          ))}
        </div>
      </details>
      <ReportBody report={report} explanation={explanation} />
    </div>
  );
}

function ScanError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const quota = error.code === "quota_exceeded";
  return (
    <div className="card border-red/50 p-5" role="alert">
      <p className="label-num">error · {error.code.replace(/_/g, " ")}</p>
      <p className="mt-2 text-base">{error.message}</p>
      {error.resetAt && <p className="mt-1 text-xs text-muted">Resets at {new Date(error.resetAt).toUTCString()}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {quota ? (
          <Link href="/token" className={btn.primary}>
            &gt;_ see holder tiers
          </Link>
        ) : (
          error.code !== "invalid_mint" &&
          error.code !== "not_a_mint" && (
            <button type="button" className={btn.primary} onClick={onRetry}>
              &gt;_ retry
            </button>
          )
        )}
        <Link href="/" className={btn.ghost}>
          scan another token
        </Link>
      </div>
    </div>
  );
}
