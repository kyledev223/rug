import type { Metadata } from "next";
import { SectionLabel } from "@/components/ui";
import { DISCLAIMER } from "@/lib/config";
import { WatchlistGate } from "./WatchlistGate";

export const metadata: Metadata = { title: "Watchlists", robots: { index: false } };

export default function WatchlistPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <SectionLabel n="00">/watchlist</SectionLabel>
      <h1 className="mt-3 text-4xl font-bold">Watchlists &amp; alerts</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Track tokens and get told when something changes: liquidity pulled, authorities changed, a big holder selling, or the risk
        score moving.
      </p>
      <div className="mt-8">
        <WatchlistGate />
      </div>
      <p className="mt-10 text-center text-xs font-bold text-red-dark">{DISCLAIMER}</p>
    </div>
  );
}
