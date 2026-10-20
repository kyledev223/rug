import type { CheckCategory, CheckResult, Explanation, ScanReport } from "@/lib/scan/types";
import { LINKS, DISCLAIMER } from "@/lib/config";
import { fmt } from "@/lib/scan/checks/util";
import { Addr, RiskBadge, SectionLabel, StatusPill, cx } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import type { ReactNode } from "react";

const CATEGORY_TITLES: Record<CheckCategory, string> = {
  authorities: "Authorities",
  token2022: "Token program",
  liquidity: "Liquidity",
  holders: "Holders",
  wallets: "Wallet patterns",
  market: "Market",
  metadata: "Metadata",
};
const CATEGORY_ORDER: CheckCategory[] = ["authorities", "token2022", "liquidity", "holders", "wallets", "market", "metadata"];

function time(iso: string) {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="w-full" aria-hidden>
      <div className="relative h-2 w-full overflow-hidden rounded-[1px] border border-line bg-paper-2">
        <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${score}%` }} />
        {[25, 50, 75].map((b) => (
          <div key={b} className="absolute inset-y-0 w-px bg-paper" style={{ left: `${b}%` }} />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-4 text-[10px] uppercase tracking-widest text-faint">
        <span>low</span>
        <span>medium</span>
        <span>high</span>
        <span>critical</span>
      </div>
    </div>
  );
}

export function ReportHeader({ report, actions }: { report: ScanReport; actions?: ReactNode }) {
  const { token } = report;
  const name = token.name || "Unknown token";
  return (
    <section className="card p-4 sm:p-6" aria-labelledby="report-title">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {token.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.image} alt="" width={56} height={56} className="size-14 shrink-0 rounded-[3px] border border-line object-cover" />
          ) : (
            <div aria-hidden className="grid size-14 shrink-0 place-items-center rounded-[3px] border border-line bg-paper-2 font-bold text-muted">
              ?
            </div>
          )}
          <div className="min-w-0">
            <h1 id="report-title" className="truncate text-2xl font-bold sm:text-3xl">
              {name} {token.symbol && <span className="text-muted">${token.symbol}</span>}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="break-all font-mono">{report.mint}</span>
              <CopyButton value={report.mint} label="copy CA" />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <a className="link" href={LINKS.solscanToken(report.mint)} target="_blank" rel="noopener noreferrer">solscan ↗</a>
              <a className="link" href={LINKS.dexscreener(report.mint)} target="_blank" rel="noopener noreferrer">dexscreener ↗</a>
              <span className="text-faint">{token.program === "spl-token-2022" ? "Token-2022" : "SPL Token"} · {token.decimals} decimals · supply {fmt.num(token.supply)}</span>
            </div>
          </div>
        </div>
        <div className="w-full shrink-0 lg:w-72">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-muted">risk score</p>
              <p className="font-display text-6xl leading-none font-bold tabular-nums">
                {report.score}
                <span className="text-xl text-faint">/100</span>
              </p>
            </div>
            <RiskBadge label={report.label} size="lg" />
          </div>
          <div className="mt-3">
            <ScoreMeter score={report.score} />
          </div>
          <p className={cx("mt-2 text-xs", report.coverage < 70 ? "font-bold text-amber" : "text-muted")}>
            data coverage {report.coverage}%{report.coverage < 70 && " — limited data, treat with extra caution"}
          </p>
        </div>
      </div>
      {actions && <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">{actions}</div>}
    </section>
  );
}

export function Overview({ explanation }: { explanation: Explanation }) {
  return (
    <section className="card border-l-2 border-l-red p-4 sm:p-5" aria-label="Summary">
      <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">
        {explanation.source === "ai" ? `plain-english summary · AI (${explanation.model})` : "plain-english summary · template"}
      </p>
      <p className="text-[15px] leading-relaxed text-ink-2">{explanation.overview}</p>
      {explanation.source === "ai" && (
        <p className="mt-2 text-[11px] text-faint">The AI only explains the rule-based results above; it does not change the score.</p>
      )}
    </section>
  );
}

function EvidenceList({ check }: { check: CheckResult }) {
  return (
    <ul className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3 text-xs">
      {check.evidence.map((e, i) => (
        <li key={i} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <span className="text-muted">{e.label}</span>
          <span className="min-w-0 break-words">
            {e.account && e.value === e.account ? <Addr address={e.account} chars={6} /> : <span className="text-ink">{e.value}</span>}
            {e.account && e.value !== e.account && (
              <>
                {" "}
                <Addr address={e.account} />
              </>
            )}
            {e.tx && (
              <>
                {" "}· tx <Addr address={e.tx} kind="tx" />
              </>
            )}
            <span className="block text-[10px] text-faint">
              {e.source} · {time(e.observedAt)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CheckCard({ check, explanation }: { check: CheckResult; explanation?: string }) {
  const open = check.status === "fail" || check.status === "warn";
  return (
    <article className={cx("card card-hover p-4", check.status === "fail" && "border-red/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={check.status} />
        <h3 className="font-mono text-sm font-bold tracking-normal">{check.title}</h3>
        {check.heuristic && (
          <span className="rounded-[2px] border border-dashed border-line-2 px-1 text-[10px] uppercase tracking-wider text-muted" title="Pattern-based; may produce false positives">
            heuristic
          </span>
        )}
        <span className="ml-auto text-[10px] text-faint">weight {check.weight}</span>
      </div>
      <p className="mt-2 text-sm text-ink">{check.summary}</p>
      {explanation && <p className="mt-1 text-[13px] text-muted">{explanation}</p>}
      <details className="group mt-1" open={open}>
        <summary className="cursor-pointer list-none text-xs text-red-dark select-none hover:text-red [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">▸ show evidence ({check.evidence.length})</span>
          <span className="hidden group-open:inline">▾ evidence ({check.evidence.length})</span>
        </summary>
        <EvidenceList check={check} />
      </details>
    </article>
  );
}

export function ChecksSection({ report, explanation }: { report: ScanReport; explanation: Explanation }) {
  return (
    <div className="space-y-8">
      {CATEGORY_ORDER.map((cat, i) => {
        const checks = report.checks.filter((c) => c.category === cat);
        if (!checks.length) return null;
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <div className="mb-3 flex items-baseline gap-3">
              <SectionLabel n={String(i + 1).padStart(2, "0")}>
                <span id={`cat-${cat}`}>{CATEGORY_TITLES[cat]}</span>
              </SectionLabel>
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {checks.map((c) => (
                <CheckCard key={c.id} check={c} explanation={explanation.checks[c.id]} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const KIND_LABEL = { wallet: "wallet", pool: "pool", burn: "burn", program: "program", pda: "PDA" } as const;

export function HoldersTable({ report }: { report: ScanReport }) {
  if (report.holders.length === 0) {
    return <p className="text-sm text-muted">Holder data unavailable for this scan.</p>;
  }
  return (
    <div className="scroll-x card">
      <table className="w-full min-w-[560px] text-left text-xs">
        <caption className="sr-only">Largest token accounts</caption>
        <thead className="border-b border-line bg-paper-2 text-[10px] uppercase tracking-widest text-muted">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">owner</th>
            <th className="px-3 py-2">type</th>
            <th className="px-3 py-2 text-right">% supply</th>
            <th className="px-3 py-2 text-right">counted</th>
          </tr>
        </thead>
        <tbody>
          {report.holders.map((h, i) => (
            <tr key={h.tokenAccount} className={cx("border-b border-line last:border-0", !h.counted && "text-muted")}>
              <td className="px-3 py-1.5 tabular-nums">{i + 1}</td>
              <td className="px-3 py-1.5">{h.owner ? <Addr address={h.owner} /> : <Addr address={h.tokenAccount} />}</td>
              <td className="px-3 py-1.5">
                <span className="uppercase tracking-wider">{KIND_LABEL[h.kind]}</span>
                {h.label && <span className="block text-[10px] text-faint">{h.label}</span>}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt.pct(h.pct)}</td>
              <td className="px-3 py-1.5 text-right">{h.counted ? "yes" : "excluded"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PoolsTable({ report }: { report: ScanReport }) {
  if (report.pools.length === 0) return <p className="text-sm text-muted">No DEX pools found.</p>;
  return (
    <div className="scroll-x card">
      <table className="w-full min-w-[560px] text-left text-xs">
        <caption className="sr-only">Liquidity pools</caption>
        <thead className="border-b border-line bg-paper-2 text-[10px] uppercase tracking-widest text-muted">
          <tr>
            <th className="px-3 py-2">dex</th>
            <th className="px-3 py-2">pair</th>
            <th className="px-3 py-2 text-right">liquidity</th>
            <th className="px-3 py-2">LP status</th>
          </tr>
        </thead>
        <tbody>
          {report.pools.slice(0, 15).map((p) => (
            <tr key={p.pairAddress} className="border-b border-line last:border-0">
              <td className="px-3 py-1.5">
                {p.dexId}
                {p.labels.length > 0 && <span className="text-faint"> {p.labels.join("/")}</span>}
                <span className="block text-[10px] text-faint">vs {p.quoteSymbol}</span>
              </td>
              <td className="px-3 py-1.5">
                <Addr address={p.pairAddress} />
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt.usd(p.liquidityUsd)}</td>
              <td className="px-3 py-1.5">
                <span className={cx("font-bold uppercase", p.lp?.status === "unburned" && "text-red-dark", p.lp?.status === "partial" && "text-amber")}>
                  {p.lp?.status ?? "unknown"}
                </span>
                <span className="block text-[10px] text-faint">{p.lp?.note}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.pools.length > 15 && <p className="px-3 py-2 text-[11px] text-faint">+{report.pools.length - 15} smaller pools</p>}
    </div>
  );
}

export function MarketGrid({ report }: { report: ScanReport }) {
  const m = report.market;
  const ratio = m.buys24h !== null && m.sells24h ? (m.buys24h / m.sells24h).toFixed(2) : "n/a";
  const items: Array<[string, string]> = [
    ["price", m.priceUsd !== null ? fmt.usd(m.priceUsd) : "n/a"],
    ["market cap", fmt.usd(m.marketCapUsd ?? m.fdvUsd)],
    ["liquidity", fmt.usd(m.liquidityUsd)],
    ["24h volume", fmt.usd(m.volume24hUsd)],
    ["24h buys / sells", `${fmt.num(m.buys24h)} / ${fmt.num(m.sells24h)}`],
    ["buy/sell ratio", ratio],
    ["first pool", m.createdAt ? `${fmt.age(Date.parse(report.generatedAt) - m.createdAt)} ago` : "n/a"],
    ["pools", report.pools.length >= 30 ? "30+" : String(report.pools.length)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="bg-paper p-3">
          <dt className="text-[10px] uppercase tracking-widest text-muted">{k}</dt>
          <dd className="mt-0.5 font-bold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SourcesList({ report }: { report: ScanReport }) {
  return (
    <ul className="space-y-1 text-xs">
      {report.sources.map((s) => (
        <li key={s.name} className="flex flex-wrap items-baseline gap-x-2">
          <span className={cx("font-bold", s.ok ? "text-ok" : "text-red-dark")}>{s.ok ? "● ok" : "● degraded"}</span>
          <span>{s.name}</span>
          <span className="text-faint">{time(s.fetchedAt)}</span>
          {s.error && <span className="w-full text-faint sm:w-auto">— {s.error}</span>}
        </li>
      ))}
      <li className="pt-1 text-faint">report generated {time(report.generatedAt)} · engine v{report.version}</li>
    </ul>
  );
}

export function ReportBody({ report, explanation }: { report: ScanReport; explanation: Explanation }) {
  return (
    <div className="space-y-10">
      <Overview explanation={explanation} />
      <ChecksSection report={report} explanation={explanation} />
      <section aria-labelledby="mkt">
        <div className="mb-3 flex items-baseline gap-3">
          <SectionLabel n="08">
            <span id="mkt">Market snapshot</span>
          </SectionLabel>
          <div className="h-px flex-1 bg-line" />
        </div>
        <MarketGrid report={report} />
      </section>
      <section aria-labelledby="hold">
        <div className="mb-3 flex items-baseline gap-3">
          <SectionLabel n="09">
            <span id="hold">Top holders</span>
          </SectionLabel>
          <div className="h-px flex-1 bg-line" />
        </div>
        <HoldersTable report={report} />
      </section>
      <section aria-labelledby="pools">
        <div className="mb-3 flex items-baseline gap-3">
          <SectionLabel n="10">
            <span id="pools">Pools</span>
          </SectionLabel>
          <div className="h-px flex-1 bg-line" />
        </div>
        <PoolsTable report={report} />
      </section>
      <section aria-labelledby="src" className="card p-4">
        <p id="src" className="mb-2 text-[11px] uppercase tracking-widest text-muted">data sources</p>
        <SourcesList report={report} />
      </section>
      <p className="border border-dashed border-red/50 bg-red-tint/40 p-3 text-center text-xs font-bold text-red-dark">{DISCLAIMER}</p>
    </div>
  );
}
