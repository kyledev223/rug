"use client";

import { TierGate } from "@/components/wallet/TierGate";
import { BulkScanner } from "@/components/bulk/BulkScanner";

export function BulkGate() {
  return (
    <TierGate minTier={2} feature="Bulk scan">
      <BulkScanner />
    </TierGate>
  );
}
