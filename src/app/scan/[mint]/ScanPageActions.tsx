"use client";

import { ScanClient } from "@/components/report/ScanClient";
import { AddToWatchlist } from "@/components/watchlist/AddToWatchlist";

/** Report page client wrapper with holder actions. */
export function ScanPageActions({ mint }: { mint: string }) {
  return <ScanClient key={mint} mint={mint} actions={() => <AddToWatchlist mint={mint} />} />;
}
