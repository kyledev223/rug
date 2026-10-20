"use client";

import { SectionLabel } from "@/components/ui";
import { TierPanel } from "@/components/wallet/TierPanel";
import { History } from "@/components/account/History";

export function AccountSections() {
  return (
    <>
      <section className="mt-8" aria-labelledby="tier">
        <SectionLabel n="01">
          <span id="tier">Your tier</span>
        </SectionLabel>
        <div className="mt-4">
          <TierPanel />
        </div>
      </section>
      <section className="mt-12" aria-labelledby="history">
        <SectionLabel n="02">
          <span id="history">Scan history</span>
        </SectionLabel>
        <div className="mt-4">
          <History />
        </div>
      </section>
    </>
  );
}
