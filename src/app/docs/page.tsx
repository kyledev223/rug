import type { Metadata } from "next";
import Link from "next/link";
import { CATALOG, TOTAL_WEIGHT } from "@/lib/scan/catalog";
import { STATUS_PENALTY, LABEL_BANDS } from "@/lib/scan/score";
import { SectionLabel } from "@/components/ui";
import { DISCLAIMER, SCAN_CACHE_TTL_MS } from "@/lib/config";

export const metadata: Metadata = {
  title: "Methodology",
  description: "Every check, how it is scored, and its limitations.",
};

const CAT_NAMES: Record<string, string> = {
  authorities: "Authorities",
  token2022: "Token program",
  liquidity: "Liquidity",
  holders: "Holders",
  wallets: "Wallet patterns (heuristic)",
  market: "Market",
  metadata: "Metadata",
};

export default function DocsPage() {
  const bands = [...LABEL_BANDS].reverse();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SectionLabel n="00">Methodology</SectionLabel>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">How the score works</h1>
      <p className="mt-4 text-[15px] text-muted">
        The score comes from fixed rules applied to live data. The same inputs always produce the same score. The AI layer only
        explains results; it cannot change them. This page lists every check, its thresholds, and what it can&apos;t see.
      </p>

      <section className="mt-12" aria-labelledby="scoring">
        <SectionLabel n="01">
          <span id="scoring">Scoring</span>
        </SectionLabel>
        <div className="mt-4 space-y-4 text-sm">
          <p>
            Each check returns a status (<b>pass</b>, <b>warn</b>, <b>fail</b> or <b>unknown</b>), a weight, and evidence. The
            score is the weighted average of each check&apos;s penalty, scaled to 0–100 (higher = more risk):
          </p>
          <pre className="card scroll-x p-4 text-xs">
{`score = round( 100 × Σ(weight × penalty) / Σ(weight) )

penalty:  pass ${STATUS_PENALTY.pass}   warn ${STATUS_PENALTY.warn}   unknown ${STATUS_PENALTY.unknown}   fail ${STATUS_PENALTY.fail}
total weight: ${TOTAL_WEIGHT}`}
          </pre>
          <p>
            <b>Unknown never counts as a pass.</b> When a data source fails or a fact can&apos;t be detected, the check adds
            {" "}{STATUS_PENALTY.unknown * 100}% of its weight as risk, and the report&apos;s <i>data coverage</i> figure drops. Coverage
            under 70% is highlighted on the report.
          </p>
          <p>
            <b>Hard red flags set a floor.</b> Some failures are severe enough that averaging would hide them. When one of these
            fails, the score is raised to at least the floor listed on that check below (50 = HIGH, 75 = CRITICAL).
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            {bands.map((b, i) => (
              <div key={b.label} className="card p-3 text-xs">
                <p className="font-bold">{b.label}</p>
                <p className="text-muted">
                  {b.min}–{bands[i + 1] ? bands[i + 1].min - 1 : 100}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="checks">
        <SectionLabel n="02">
          <span id="checks">Checks</span>
        </SectionLabel>
        <div className="mt-4 space-y-4">
          {CATALOG.map((c) => (
            <article key={c.id} id={c.id} className="card scroll-mt-28 p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-bold">{c.title}</h2>
                <span className="text-xs text-muted">
                  {CAT_NAMES[c.category]} · weight {c.weight} ({((c.weight / TOTAL_WEIGHT) * 100).toFixed(1)}%)
                </span>
                {c.heuristic && (
                  <span className="rounded-[2px] border border-dashed border-line-2 px-1 text-[10px] uppercase tracking-wider text-muted">
                    heuristic
                  </span>
                )}
                <code className="ml-auto text-[11px] text-faint">{c.id}</code>
              </div>
              <p className="mt-2 text-sm">{c.what}</p>
              <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-[6rem_1fr]">
                {(["pass", "warn", "fail", "unknown"] as const).map((s) =>
                  c.rules[s] ? (
                    <div key={s} className="contents">
                      <dt className="font-bold uppercase tracking-wider text-muted">{s}</dt>
                      <dd>{c.rules[s]}</dd>
                    </div>
                  ) : null,
                )}
                {!c.rules.unknown && (
                  <div className="contents">
                    <dt className="font-bold uppercase tracking-wider text-muted">unknown</dt>
                    <dd>The data source failed or returned nothing.</dd>
                  </div>
                )}
              </dl>
              {c.floor && <p className="mt-3 text-xs font-bold text-red-dark">Floor: {c.floor}</p>}
              <p className="mt-3 text-xs text-muted">
                <span className="font-bold">Sources:</span> {c.sources.join(" · ")}
              </p>
              <p className="mt-1 text-xs text-muted">
                <span className="font-bold">Limitations:</span> {c.limitations}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="limits">
        <SectionLabel n="03">
          <span id="limits">General limitations</span>
        </SectionLabel>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
          <li>Signals, not verdicts. A token can pass every check and still go to zero. Teams can sell, abandon, or change plans.</li>
          <li>Only on-chain and public market data is read. Off-chain promises, team identity, and audits are not evaluated.</li>
          <li>
            Results are cached for {SCAN_CACHE_TTL_MS / 60_000} minutes per token. Conditions can change faster than that. Check the
            timestamps on each piece of evidence.
          </li>
          <li>Wallet-pattern checks are heuristics and produce false positives (exchanges, market makers, airdrops).</li>
          <li>Only the 20 largest token accounts and up to 30 pools are visible to the free data sources used.</li>
          <li>
            The AI explanation can be wrong or incomplete. It is instructed and checked to never call a token safe or give advice,
            and it falls back to templates when unavailable.
          </li>
        </ul>
        <p className="mt-8 border border-dashed border-red/50 bg-red-tint/40 p-3 text-center text-xs font-bold text-red-dark">{DISCLAIMER}</p>
        <p className="mt-6 text-sm">
          Programmatic access: <Link href="/api-docs" className="link">/api-docs</Link>
        </p>
      </section>
    </div>
  );
}
