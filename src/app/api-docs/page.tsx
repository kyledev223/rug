import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/ui";
import { API_LIMITS, APP_NAME, DISCLAIMER } from "@/lib/config";
import { KeysGate } from "./KeysGate";

export const metadata: Metadata = { title: "API reference", description: `${APP_NAME} HTTP API for tier 3 holders.` };

const site = process.env.NEXT_PUBLIC_SITE_URL || "https://your-app.vercel.app";

function Code({ children }: { children: string }) {
  return <pre className="card scroll-x mt-2 p-4 text-xs leading-relaxed">{children}</pre>;
}

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SectionLabel n="00">/api-docs</SectionLabel>
      <h1 className="mt-3 text-4xl font-bold">API reference</h1>
      <p className="mt-3 text-sm text-muted">
        Programmatic scans for Holder III wallets. Same engine, same evidence, same score as the website. Read the{" "}
        <Link href="/docs" className="link">methodology</Link> before building on it.
      </p>

      <section className="mt-10" aria-labelledby="keys">
        <SectionLabel n="01">
          <span id="keys">Your API keys</span>
        </SectionLabel>
        <div className="mt-4">
          <KeysGate />
        </div>
      </section>

      <section className="mt-12 space-y-3 text-sm" aria-labelledby="auth">
        <SectionLabel n="02">
          <span id="auth">Authentication &amp; limits</span>
        </SectionLabel>
        <p>Send your key in the <code>Authorization</code> header (or <code>x-api-key</code>):</p>
        <Code>{`Authorization: Bearer rc_live_XXXXXXXXXXXXXXXX`}</Code>
        <ul className="list-disc space-y-1 pl-5">
          <li>{API_LIMITS.perMinute} requests / minute and {API_LIMITS.perDay.toLocaleString("en-US")} requests / UTC day per key.</li>
          <li>Results are cached for 5 minutes per mint. <code>cached: true</code> tells you when.</li>
          <li>The key&apos;s wallet must still hold the tier 3 balance. Balances are re-checked every few hours.</li>
          <li>Rate-limit state is returned in <code>x-ratelimit-*</code> headers; 429 responses include <code>retry-after</code>.</li>
        </ul>
      </section>

      <section className="mt-12 space-y-3 text-sm" aria-labelledby="scan">
        <SectionLabel n="03">
          <span id="scan">GET /api/v1/scan</span>
        </SectionLabel>
        <p>Scans one mint and returns the full report.</p>
        <Code>{`curl -s "${site}/api/v1/scan?mint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" \\
  -H "Authorization: Bearer $RUGCHECK_API_KEY"`}</Code>
        <p>Response (trimmed):</p>
        <Code>{`{
  "report": {
    "version": "1.0.0",
    "mint": "DezX…B263",
    "generatedAt": "2026-10-20T02:23:15.707Z",
    "token": { "name": "Bonk", "symbol": "Bonk", "decimals": 5, "supply": 87994322269086.05, "program": "spl-token" },
    "score": 13,                 // 0-100, higher = more risk
    "label": "LOW",              // LOW | MEDIUM | HIGH | CRITICAL
    "coverage": 71,              // % of check weight with real data
    "checks": [
      {
        "id": "mint_authority",
        "title": "Mint authority",
        "category": "authorities",
        "status": "pass",        // pass | warn | fail | unknown
        "weight": 20,
        "summary": "Mint authority is revoked — supply is fixed",
        "evidence": [
          { "label": "Mint authority", "value": "none (revoked)", "source": "Solana RPC", "observedAt": "…" }
        ]
      }
      // … 13 more checks
    ],
    "holders": [ { "owner": "…", "pct": 2.1, "kind": "wallet", "counted": true } ],
    "pools":   [ { "pairAddress": "…", "dexId": "raydium", "liquidityUsd": 900000, "lp": { "status": "burned" } } ],
    "market":  { "priceUsd": 0.0000029, "marketCapUsd": 259940000, "liquidityUsd": 1180000, "volume24hUsd": 326000 },
    "sources": [ { "name": "DexScreener", "ok": true, "fetchedAt": "…" } ]
  },
  "explanation": { "source": "template", "overview": "…", "checks": { "mint_authority": "…" } },
  "cached": false,
  "disclaimer": "${DISCLAIMER}"
}`}</Code>
      </section>

      <section className="mt-12 space-y-3 text-sm" aria-labelledby="usage">
        <SectionLabel n="04">
          <span id="usage">GET /api/v1/usage</span>
        </SectionLabel>
        <p>Today&apos;s request count for the calling key.</p>
        <Code>{`{ "wallet": "…", "tier": 3, "usedToday": 42, "limits": { "perMinute": ${API_LIMITS.perMinute}, "perDay": ${API_LIMITS.perDay} }, "resetsAt": "…" }`}</Code>
      </section>

      <section className="mt-12 space-y-3 text-sm" aria-labelledby="errors">
        <SectionLabel n="05">
          <span id="errors">Errors</span>
        </SectionLabel>
        <p>Errors use one shape: <code>{`{ "error": { "code": "…", "message": "…" } }`}</code></p>
        <div className="scroll-x card">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="border-b border-line bg-paper-2 text-[10px] uppercase tracking-widest text-muted">
              <tr>
                <th className="px-3 py-2">status</th>
                <th className="px-3 py-2">code</th>
                <th className="px-3 py-2">meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["400", "invalid_mint", "Not a base58 32-byte address"],
                ["400", "not_a_mint", "Address exists but isn't an SPL / Token-2022 mint"],
                ["401", "missing_key / invalid_key", "No key, unknown key, or revoked key"],
                ["403", "tier_required", "The key's wallet no longer qualifies for tier 3"],
                ["404", "not_a_mint", "No account at this address"],
                ["429", "rate_limited / quota_exceeded", "Per-minute or daily limit hit"],
                ["502", "upstream_error", "A data source failed; retry later"],
              ].map(([s, c, m]) => (
                <tr key={s + c} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5 font-bold">{s}</td>
                  <td className="px-3 py-1.5"><code>{c}</code></td>
                  <td className="px-3 py-1.5">{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pt-4 text-xs font-bold text-red-dark">
          {DISCLAIMER} Don&apos;t wire scores straight into automated buying decisions.
        </p>
      </section>
    </div>
  );
}
