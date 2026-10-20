"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CheckStatus, ScanReport } from "@/lib/scan/types";
import { parseMintList, shortAddr } from "@/lib/solana/address";
import { concentration } from "@/lib/scan/checks/holders";
import { fmt } from "@/lib/scan/checks/util";
import { toCsv } from "@/lib/csv";
import { APP_SHORT, TIERS } from "@/lib/config";
import { RiskBadge, btn, cx } from "@/components/ui";

const MAX = TIERS[2].bulkMax;
const CONCURRENCY = 3;

interface Row {
  mint: string;
  status: "queued" | "scanning" | "done" | "error";
  report?: ScanReport;
  error?: string;
}

function checkStatus(r: ScanReport | undefined, id: string): CheckStatus | null {
  return r?.checks.find((c) => c.id === id)?.status ?? null;
}

function derive(r?: ScanReport) {
  const c = r ? concentration(r.holders) : null;
  return {
    name: r ? (r.token.symbol ? `$${r.token.symbol}` : r.token.name ?? "unknown") : "",
    score: r?.score ?? null,
    label: r?.label ?? null,
    liquidity: r?.market.liquidityUsd ?? null,
    mcap: r ? (r.market.marketCapUsd ?? r.market.fdvUsd) : null,
    top1: c && r?.holders.length ? c.top1 : null,
    top10: c && r?.holders.length ? c.top10 : null,
    mintAuth: checkStatus(r, "mint_authority"),
    freezeAuth: checkStatus(r, "freeze_authority"),
    lp: r?.pools[0]?.lp?.status ?? null,
    coverage: r?.coverage ?? null,
  };
}

type SortKey = "name" | "score" | "liquidity" | "top1" | "top10" | "coverage";

const COLS: Array<{ key: SortKey | null; label: string; align?: "right" }> = [
  { key: "name", label: "token" },
  { key: "score", label: "score", align: "right" },
  { key: null, label: "label" },
  { key: "liquidity", label: "liquidity", align: "right" },
  { key: "top1", label: "top 1", align: "right" },
  { key: "top10", label: "top 10", align: "right" },
  { key: null, label: "mint auth" },
  { key: null, label: "freeze auth" },
  { key: null, label: "LP" },
  { key: "coverage", label: "coverage", align: "right" },
];

function authCell(s: CheckStatus | null) {
  if (s === "fail") return <span className="font-bold text-red-dark">active</span>;
  if (s === "pass") return <span className="text-ok">revoked</span>;
  return <span className="text-faint">?</span>;
}

export function BulkScanner() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [notice, setNotice] = useState<string | null>(null);
  const stop = useRef(false);

  const parsed = useMemo(() => parseMintList(text), [text]);

  async function start() {
    setNotice(null);
    const mints = parsed.valid.slice(0, MAX);
    if (mints.length === 0) return setNotice("Paste at least one valid mint address.");
    if (parsed.valid.length > MAX) setNotice(`Only the first ${MAX} mints will be scanned.`);
    const initial: Row[] = mints.map((mint) => ({ mint, status: "queued" }));
    setRows(initial);
    setRunning(true);
    stop.current = false;
    const update = (mint: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.mint === mint ? { ...r, ...patch } : r)));
    let i = 0;
    const worker = async () => {
      while (i < mints.length && !stop.current) {
        const mint = mints[i++];
        update(mint, { status: "scanning" });
        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mint, via: "bulk" }),
          });
          const body = await res.json().catch(() => null);
          if (res.ok && body?.report) update(mint, { status: "done", report: body.report });
          else {
            update(mint, { status: "error", error: body?.error?.message ?? `HTTP ${res.status}` });
            if (res.status === 429) await new Promise((r) => setTimeout(r, 4000));
          }
        } catch {
          update(mint, { status: "error", error: "network error" });
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRows((rs) => rs.map((r) => (r.status === "queued" ? { ...r, status: "error", error: "stopped" } : r)));
    setRunning(false);
  }

  const sorted = useMemo(() => {
    const withD = rows.map((r) => ({ row: r, d: derive(r.report) }));
    return withD.sort((a, b) => {
      const av = a.d[sort.key];
      const bv = b.d[sort.key];
      if (av === null || av === "") return 1;
      if (bv === null || bv === "") return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
  }, [rows, sort]);

  function exportCsv() {
    const done = rows.filter((r) => r.report);
    const checkIds = done[0]?.report?.checks.map((c) => c.id) ?? [];
    const headers = [
      "mint", "name", "symbol", "score", "label", "coverage_pct", "liquidity_usd", "market_cap_usd",
      "top1_pct", "top10_pct", "lp_status", "generated_at", ...checkIds.map((id) => `check_${id}`),
    ];
    const data = rows.map((r) => {
      const rep = r.report;
      const d = derive(rep);
      return [
        r.mint, rep?.token.name ?? "", rep?.token.symbol ?? "", d.score ?? "", d.label ?? (r.error ? `error: ${r.error}` : ""),
        d.coverage ?? "", d.liquidity ?? "", d.mcap ?? "", d.top1?.toFixed(2) ?? "", d.top10?.toFixed(2) ?? "", d.lp ?? "",
        rep?.generatedAt ?? "", ...checkIds.map((id) => checkStatus(rep, id) ?? ""),
      ];
    });
    const blob = new Blob([toCsv(headers, data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${APP_SHORT}-bulk-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const done = rows.filter((r) => r.status === "done" || r.status === "error").length;

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <label htmlFor="bulk-input" className="text-[11px] uppercase tracking-widest text-muted">
          mint addresses — one per line, or separated by commas/spaces (max {MAX})
        </label>
        <textarea
          id="bulk-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          spellCheck={false}
          className="mt-2 w-full resize-y rounded-[3px] border border-line-2 bg-paper p-3 font-mono text-xs outline-none focus:border-ink"
          placeholder={"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263\nJUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <span className={cx(parsed.valid.length > MAX && "font-bold text-amber")}>
            {parsed.valid.length} valid{parsed.valid.length > MAX && ` (first ${MAX} used)`}
          </span>
          {parsed.invalid.length > 0 && (
            <span className="text-red-dark" title={parsed.invalid.join("\n")}>
              {parsed.invalid.length} invalid ignored
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {running ? (
              <button type="button" className={btn.ghost} onClick={() => (stop.current = true)}>
                ■ stop
              </button>
            ) : (
              <button type="button" className={btn.primary} onClick={() => void start()} disabled={parsed.valid.length === 0}>
                &gt;_ scan {Math.min(parsed.valid.length, MAX) || ""}
              </button>
            )}
            <button type="button" className={btn.ghost} onClick={exportCsv} disabled={!rows.some((r) => r.report)}>
              ↓ CSV
            </button>
          </div>
        </div>
        {notice && <p className="mt-2 text-xs font-bold text-amber">{notice}</p>}
      </div>

      {rows.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted" aria-live="polite">
            {running ? `scanning… ${done}/${rows.length}` : `${done}/${rows.length} complete`}
          </p>
          <div className="scroll-x card">
            <table className="w-full min-w-[920px] text-left text-xs">
              <caption className="sr-only">Bulk scan results</caption>
              <thead className="border-b border-line bg-paper-2 text-[10px] uppercase tracking-widest text-muted">
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.label}
                      className={cx("px-3 py-2", c.align === "right" && "text-right")}
                      aria-sort={c.key && sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    >
                      {c.key ? (
                        <button
                          type="button"
                          className="uppercase tracking-widest hover:text-red-dark"
                          onClick={() => setSort((s) => ({ key: c.key!, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : -1 }))}
                        >
                          {c.label}
                          {sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ row, d }) => (
                  <tr key={row.mint} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5">
                      {row.report ? (
                        <Link href={`/scan/${row.mint}`} className="link font-bold" target="_blank">
                          {d.name}
                        </Link>
                      ) : (
                        <span className="text-muted">{shortAddr(row.mint)}</span>
                      )}
                      <span className="block text-[10px] text-faint">{shortAddr(row.mint)}</span>
                    </td>
                    {row.status !== "done" ? (
                      <td colSpan={COLS.length - 1} className={cx("px-3 py-1.5", row.status === "error" ? "text-red-dark" : "text-muted")}>
                        {row.status === "error" ? row.error : row.status === "scanning" ? "scanning…" : "queued"}
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums">{d.score}</td>
                        <td className="px-3 py-1.5">{d.label && <RiskBadge label={d.label} size="sm" />}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt.usd(d.liquidity)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{d.top1 === null ? "?" : fmt.pct(d.top1, 1)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{d.top10 === null ? "?" : fmt.pct(d.top10, 1)}</td>
                        <td className="px-3 py-1.5">{authCell(d.mintAuth)}</td>
                        <td className="px-3 py-1.5">{authCell(d.freezeAuth)}</td>
                        <td className="px-3 py-1.5">{d.lp ?? "?"}</td>
                        <td className={cx("px-3 py-1.5 text-right tabular-nums", (d.coverage ?? 0) < 70 && "text-amber")}>{d.coverage}%</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
