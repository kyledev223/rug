import Link from "next/link";
import { connection } from "next/server";
import { repo } from "@/lib/db";
import { RiskBadge } from "./ui";
import { shortAddr } from "@/lib/solana/address";
import { logError } from "@/lib/log";

// Server component rendered per request (after connection()), so reading the clock is intentional.
const requestTime = () => Date.now();

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Latest scan per mint from the last 48h. Real data only; empty state otherwise. */
export async function RecentScans({ limit = 12 }: { limit?: number }) {
  await connection();
  let rows: Awaited<ReturnType<ReturnType<typeof repo>["recentScans"]>> = [];
  let failed = false;
  try {
    rows = await repo().recentScans(limit);
  } catch (e) {
    logError("recentScans", e);
    failed = true;
  }
  const now = requestTime();
  if (failed) return <p className="card p-4 text-sm text-muted">The public scan feed is temporarily unavailable.</p>;
  if (rows.length === 0)
    return <p className="card p-4 text-sm text-muted">No scans in the last 48 hours yet. Be the first. Paste a mint above.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <li key={r.mint}>
          <Link href={`/scan/${r.mint}`} className="card card-hover flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block truncate font-bold">{r.symbol ? `$${r.symbol}` : r.name ?? "Unknown"}</span>
              <span className="block text-[11px] text-muted">
                {shortAddr(r.mint)} · {ago(r.created_at, now)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-display text-lg font-bold tabular-nums">{r.score}</span>
              <RiskBadge label={r.label} size="sm" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
