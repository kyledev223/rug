"use client";

import { ScanClient } from "@/components/report/ScanClient";

/** Report page client wrapper; holder actions (watchlist) plug in here. */
export function ScanPageActions({ mint }: { mint: string }) {
  return <ScanClient key={mint} mint={mint} />;
}
