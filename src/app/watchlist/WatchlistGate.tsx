"use client";

import { TierGate } from "@/components/wallet/TierGate";
import { WatchlistManager } from "@/components/watchlist/WatchlistManager";
import { useSession } from "@/components/wallet/SessionProvider";

export function WatchlistGate() {
  const { session } = useSession();
  return (
    <TierGate minTier={1} feature="Watchlists">
      {/* Remount when the wallet changes so data never leaks across sessions. */}
      <WatchlistManager key={session?.wallet ?? "none"} />
    </TierGate>
  );
}
