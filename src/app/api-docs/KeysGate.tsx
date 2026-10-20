"use client";

import { TierGate } from "@/components/wallet/TierGate";
import { ApiKeys } from "@/components/account/ApiKeys";
import { useSession } from "@/components/wallet/SessionProvider";

export function KeysGate() {
  const { session } = useSession();
  return (
    <TierGate minTier={3} feature="API access">
      <ApiKeys key={session?.wallet ?? "none"} />
    </TierGate>
  );
}
