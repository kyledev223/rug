import type { Metadata } from "next";
import { SectionLabel } from "@/components/ui";
import { DISCLAIMER } from "@/lib/config";
import { BulkGate } from "./BulkGate";

export const metadata: Metadata = { title: "Bulk scan", description: "Scan up to 25 Solana tokens at once (Holder II+)." };

export default function BulkPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <SectionLabel n="00">/bulk</SectionLabel>
      <h1 className="mt-3 text-4xl font-bold">Bulk scan</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Paste up to 25 mints. Each one gets the full rules-based scan. Sort the results and export them as CSV.
      </p>
      <div className="mt-8">
        <BulkGate />
      </div>
      <p className="mt-10 text-center text-xs font-bold text-red-dark">{DISCLAIMER}</p>
    </div>
  );
}
