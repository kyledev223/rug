"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ScanRow } from "@/lib/db/types";
import { RiskBadge } from "@/components/ui";
import { shortAddr } from "@/lib/solana/address";
import { useSession } from "@/components/wallet/SessionProvider";

export function History() {
  const { session, needsVerify } = useSession();
  const allowed = Boolean(session?.wallet && !needsVerify && session.features.history);
  const [rows, setRows] = useState<ScanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    fetch("/api/history", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j?.error?.message ?? "Couldn't load history.");
        else setRows(j.history);
      })
      .catch(() => alive && setError("Couldn't load history."));
    return () => {
      alive = false;
    };
  }, [allowed, session?.wallet]);

  if (!session?.wallet || needsVerify) return <p className="card p-4 text-sm text-muted">Verify a wallet to keep a scan history.</p>;
  if (!session.features.history)
    return (
      <p className="card p-4 text-sm text-muted">
        Scan history unlocks at Holder I. <Link className="link" href="/token">See tiers</Link>
      </p>
    );
  if (error) return <p className="card p-4 text-sm text-red-dark">{error}</p>;
  if (!rows) return <p className="card p-4 text-sm text-muted">loading history…</p>;
  if (rows.length === 0) return <p className="card p-4 text-sm text-muted">No scans yet with this wallet.</p>;
  return (
    <div className="scroll-x card">
      <table className="w-full min-w-[520px] text-left text-xs">
        <caption className="sr-only">Your recent scans</caption>
        <thead className="border-b border-line bg-paper-2 text-[10px] uppercase tracking-widest text-muted">
          <tr>
            <th className="px-3 py-2">when</th>
            <th className="px-3 py-2">token</th>
            <th className="px-3 py-2 text-right">score</th>
            <th className="px-3 py-2">label</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.mint}-${i}`} className="border-b border-line last:border-0">
              <td className="px-3 py-1.5 text-muted">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-3 py-1.5">
                <Link className="link" href={`/scan/${r.mint}`}>
                  {r.symbol ? `$${r.symbol}` : r.name ?? shortAddr(r.mint)}
                </Link>{" "}
                <span className="text-faint">{shortAddr(r.mint)}</span>
              </td>
              <td className="px-3 py-1.5 text-right font-bold tabular-nums">{r.score}</td>
              <td className="px-3 py-1.5">
                <RiskBadge label={r.label} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
