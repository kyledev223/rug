import type { Metadata } from "next";
import { TierTable } from "@/components/TierTable";
import { TokenSection } from "@/components/TokenSection";
import { SectionLabel } from "@/components/ui";
import { APP_NAME, DISCLAIMER, TIERS, TOKEN_MINT, TOKEN_TICKER } from "@/lib/config";
import { TierPanelSlot } from "./TierPanelSlot";

export const metadata: Metadata = {
  title: `${TOKEN_TICKER} & holder tiers`,
  description: `What ${TOKEN_TICKER} unlocks on ${APP_NAME} and how wallet verification works.`,
};

export default function TokenPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <SectionLabel n="00">{TOKEN_TICKER}</SectionLabel>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl">The token behind the scanner</h1>
      <p className="mt-4 max-w-2xl text-[15px] text-muted">
        {TOKEN_TICKER} is a Solana memecoin paired with {APP_NAME}. Holding it unlocks more usage of the scanner. That is all it
        does. It is not an investment product, carries no promise of value, and holding it does not change any scan result.
      </p>

      {TOKEN_MINT ? (
        <div className="mt-8">
          <TokenSection />
        </div>
      ) : (
        <p className="mt-8 card border-dashed p-4 text-sm text-muted">
          {TOKEN_TICKER} has not launched yet. No contract address exists. Ignore anyone sharing one before it appears on this page.
        </p>
      )}

      <section className="mt-12" aria-labelledby="yours">
        <SectionLabel n="01">
          <span id="yours">Your tier</span>
        </SectionLabel>
        <div className="mt-4">
          <TierPanelSlot />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="tiers">
        <SectionLabel n="02">
          <span id="tiers">Tiers</span>
        </SectionLabel>
        <div className="mt-4">
          <TierTable />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="verify">
        <SectionLabel n="03">
          <span id="verify">How verification works</span>
        </SectionLabel>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["Connect", "Connect Phantom, Solflare, Backpack or any Wallet Standard wallet. Connecting shares only your public address."],
            [
              "Sign a message",
              "You sign a plain-text message containing a one-time nonce and timestamp. It is not a transaction: no fees, no approvals, nothing leaves your wallet.",
            ],
            [
              "We check your balance",
              `The server verifies the signature and reads your ${TOKEN_TICKER} balance on-chain. Balances are re-checked every few hours and on each new session.`,
            ],
          ].map(([t, b], i) => (
            <li key={t} className="card p-4">
              <p className="font-mono text-xs text-red-dark">step {String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 font-display text-lg font-bold">{t}</p>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-l-2 border-red pl-3 text-sm font-bold">
          {APP_NAME} will never ask for your seed phrase or private key. Anyone who does is trying to steal your funds.
        </p>
        <p className="mt-4 text-xs text-muted">
          Thresholds: {TIERS.slice(1).map((t) => `${t.name} ≥ ${t.minBalance.toLocaleString("en-US")}`).join(" · ")} {TOKEN_TICKER}.
          Thresholds may be adjusted after launch.
        </p>
      </section>

      <p className="mt-12 text-center text-xs font-bold text-red-dark">{DISCLAIMER}</p>
    </div>
  );
}
