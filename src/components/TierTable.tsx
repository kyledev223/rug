import { TIERS, TOKEN_TICKER } from "@/lib/config";
import { cx } from "./ui";

function yes(v: boolean | string) {
  if (v === false) return <span className="text-faint">—</span>;
  if (v === true) return <span className="font-bold text-red-dark">✓</span>;
  return <span>{v}</span>;
}

export function TierTable() {
  const rows: Array<[string, (t: (typeof TIERS)[number]) => boolean | string]> = [
    ["hold", (t) => (t.minBalance === 0 ? "no wallet needed" : `≥ ${t.minBalance.toLocaleString("en-US")} ${TOKEN_TICKER}`)],
    ["single scans / day", (t) => (t.dailyScans === null ? "unlimited" : String(t.dailyScans))],
    ["scan history", (t) => t.history],
    ["watchlists", (t) => (t.watchlists ? `${t.watchlists} × ${t.watchlistSize} tokens` : false)],
    ["bulk scan + CSV", (t) => (t.bulk ? `up to ${t.bulkMax} mints` : false)],
    ["risk-change alerts", (t) => t.alerts],
    ["personal API key", (t) => t.apiKey],
  ];
  return (
    <div className="scroll-x card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">Tier comparison</caption>
        <thead>
          <tr className="border-b border-line">
            <th className="p-3 text-[11px] font-normal uppercase tracking-widest text-muted">feature</th>
            {TIERS.map((t) => (
              <th key={t.id} className={cx("p-3 align-bottom", t.id === 2 && "bg-red-tint/50")}>
                <span className="block text-[10px] font-normal uppercase tracking-widest text-muted">tier {t.id}</span>
                <span className="font-display text-lg">{t.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label} className="border-b border-line last:border-0">
              <th scope="row" className="p-3 text-xs font-normal text-muted">
                {label}
              </th>
              {TIERS.map((t) => (
                <td key={t.id} className={cx("p-3 text-xs", t.id === 2 && "bg-red-tint/30")}>
                  {yes(fn(t))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
