import Link from "next/link";
import { Suspense } from "react";
import { ScanForm } from "@/components/ScanForm";
import { RecentScans } from "@/components/RecentScans";
import { TierTable } from "@/components/TierTable";
import { TokenSection } from "@/components/TokenSection";
import { LiveDot, SectionLabel, btn } from "@/components/ui";
import { APP_NAME, APP_SHORT, DISCLAIMER, TOKEN_MINT, TOKEN_TICKER } from "@/lib/config";
import { CATALOG } from "@/lib/scan/catalog";

const EXAMPLES = [
  { label: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { label: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
];

const STEPS = [
  {
    n: "01",
    title: "Paste a mint",
    body: "Any SPL or Token-2022 mint address. We validate it on-chain before spending a single API call.",
  },
  {
    n: "02",
    title: "Rules run on live data",
    body: `${CATALOG.length} deterministic checks read Solana RPC, Helius, DexScreener and Raydium. The rules alone produce the 0–100 score.`,
  },
  {
    n: "03",
    title: "Read the evidence",
    body: "Every warning lists raw values, the accounts involved (linked to Solscan), the data source and when it was fetched. An AI then explains it in plain English. It never changes the score.",
  },
];

const FAQ = [
  {
    q: "Does a LOW score mean a token is safe?",
    a: "No. A low score means our automated rules found few risk signals. Developers can still sell, new risks can appear minutes later, and some scams can't be detected on-chain at all.",
  },
  {
    q: "Where does the data come from?",
    a: "Mint, holder and wallet data comes from Solana RPC (Helius). Metadata from Helius DAS or the Metaplex metadata account. Pools, liquidity and trades from DexScreener. LP burn status from the Raydium API. Every piece of evidence shows its source and timestamp.",
  },
  {
    q: "What does \"unknown\" mean?",
    a: "A data source failed or a fact can't be detected automatically. Unknown is never treated as a pass. It adds risk to the score and lowers the coverage figure shown on the report.",
  },
  {
    q: "What does the AI do?",
    a: "It only rewrites the rule results into beginner-friendly language. It is instructed never to call a token safe, never to give buy or sell advice, and never to contradict the score. Its output is checked by a guard. If the AI is down or rate-limited, a template explanation is shown instead.",
  },
  {
    q: "Do you need my wallet or seed phrase?",
    a: "Never. Scanning needs no wallet at all. Holder tiers ask you to sign a plain-text message to prove ownership. No transaction, no approvals, no fees. Nobody legitimate will ever ask for your seed phrase or private key.",
  },
  {
    q: "How fresh are results?",
    a: "Results are cached for 5 minutes per token to stay inside free API quotas. The report shows exactly when each value was fetched, and you can rescan after the cache expires.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* hero */}
      <section id="scan" className="scroll-mt-28 grid gap-10 pt-12 pb-16 sm:pt-20 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <LiveDot label="mainnet · live data" />
          <h1 className="mt-4 text-4xl leading-[1.05] font-bold sm:text-6xl">
            Check the token
            <br />
            <span className="text-red">before</span> it checks you.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] text-muted">
            Paste a Solana mint. {APP_NAME} runs {CATALOG.length} rules-based checks: authorities, Token-2022 traps, liquidity,
            holders and wallet patterns. Every flag comes with on-chain evidence.
          </p>
          <div className="mt-7 max-w-2xl">
            <ScanForm />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>try:</span>
            {EXAMPLES.map((e) => (
              <Link key={e.mint} href={`/scan/${e.mint}`} className="link">
                {e.label}
              </Link>
            ))}
            <span className="text-faint">· 5 free scans/day, no wallet needed</span>
          </p>
        </div>
        <div className="card overflow-hidden" aria-label="What a scan checks">
          <div className="flex items-center gap-2 border-b border-line bg-paper-2 px-3 py-1.5 text-[11px] text-muted">
            <span aria-hidden className="flex gap-1">
              <span className="size-2 rounded-full bg-red" />
              <span className="size-2 rounded-full bg-line-2" />
              <span className="size-2 rounded-full bg-line-2" />
            </span>
            {APP_SHORT} --list-checks
          </div>
          <ol className="p-4 font-mono text-xs leading-relaxed">
            <li className="font-bold">&gt; {CATALOG.length} checks loaded</li>
            {CATALOG.map((c, i) => (
              <li key={c.id} className="flex gap-2 text-muted">
                <span className="text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-ink">{c.title.toLowerCase()}</span>
                <span className="ml-auto text-faint">w{c.weight}</span>
                {c.heuristic && <span className="text-amber">~</span>}
              </li>
            ))}
            <li className="mt-1 text-faint">~ heuristic · w = weight in score</li>
          </ol>
        </div>
      </section>

      {/* how it works */}
      <section aria-labelledby="how" className="py-12">
        <SectionLabel n="01">
          <span id="how">How it works</span>
        </SectionLabel>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card card-hover p-5">
              <p className="font-mono text-xs text-red-dark">step {s.n}</p>
              <h2 className="mt-2 text-xl font-bold">{s.title}</h2>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ["LOW", "0–24", "few signals found"],
            ["MEDIUM", "25–49", "review the warnings"],
            ["HIGH", "50–74", "serious red flags"],
            ["CRITICAL", "75–100", "rug / honeypot patterns"],
          ].map(([l, r, d]) => (
            <div key={l} className="flex items-center justify-between gap-2 border-l-2 border-line-2 py-1 pl-3 text-xs">
              <span>
                <span className="font-bold">{l}</span> <span className="text-muted">{r}</span>
              </span>
              <span className="text-faint">{d}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Full methodology, thresholds and limitations: <Link href="/docs" className="link">/docs</Link>
        </p>
      </section>

      {/* tiers */}
      <section aria-labelledby="tiers" className="py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel n="02">
              <span id="tiers">Holder tiers</span>
            </SectionLabel>
            <h2 className="mt-2 text-3xl font-bold">Hold {TOKEN_TICKER}, unlock more.</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Verify with a free off-chain signature. No transaction, no approvals.
              {!TOKEN_MINT && " The token has not launched yet, so holder tiers activate at launch."}
            </p>
          </div>
          <Link href="/token" className={btn.ghost}>
            &gt;_ tier details
          </Link>
        </div>
        <div className="mt-5">
          <TierTable />
        </div>
      </section>

      {/* token */}
      {TOKEN_MINT && (
        <section aria-labelledby="token" className="py-12">
          <SectionLabel n="03">
            <span id="token">{TOKEN_TICKER}</span>
          </SectionLabel>
          <div className="mt-5">
            <TokenSection />
          </div>
        </section>
      )}

      {/* recent scans */}
      <section aria-labelledby="recent" className="py-12">
        <div className="flex items-center gap-3">
          <SectionLabel n={TOKEN_MINT ? "04" : "03"}>
            <span id="recent">Recent public scans</span>
          </SectionLabel>
          <LiveDot />
        </div>
        <div className="mt-5">
          <Suspense fallback={<p className="card p-4 text-sm text-muted">loading feed…</p>}>
            <RecentScans />
          </Suspense>
        </div>
      </section>

      {/* faq */}
      <section aria-labelledby="faq" className="py-12">
        <SectionLabel n={TOKEN_MINT ? "05" : "04"}>
          <span id="faq">FAQ</span>
        </SectionLabel>
        <div className="mt-5 divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="font-mono text-red transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-3xl text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-xs font-bold text-red-dark">{DISCLAIMER}</p>
      </section>
    </div>
  );
}
