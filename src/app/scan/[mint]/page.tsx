import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isValidPublicKey } from "@/lib/solana/address";
import { repo } from "@/lib/db";
import { ScanPageActions } from "./ScanPageActions";
import { APP_NAME } from "@/lib/config";

export async function generateMetadata({ params }: PageProps<"/scan/[mint]">): Promise<Metadata> {
  const { mint } = await params;
  if (!isValidPublicKey(mint)) return { title: "Invalid address" };
  let title = `Risk report ${mint.slice(0, 4)}…${mint.slice(-4)}`;
  let description = `Automated Solana token risk report on ${APP_NAME}.`;
  try {
    const last = await repo().latestScanForMint(mint);
    if (last) {
      const name = last.symbol ? `$${last.symbol}` : last.name ?? "token";
      title = `${name} risk report — ${last.score}/100 ${last.label}`;
      description = `${name} scored ${last.score}/100 (${last.label}) on ${APP_NAME}. Automated signals, not financial advice.`;
    }
  } catch {
    /* metadata falls back to generic text */
  }
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

async function ScanBody({ params }: { params: PageProps<"/scan/[mint]">["params"] }) {
  const { mint } = await params;
  if (!isValidPublicKey(mint)) notFound();
  return <ScanPageActions mint={mint} />;
}

export default function ScanPage({ params }: PageProps<"/scan/[mint]">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <Suspense
        fallback={
          <div className="card p-4 text-xs text-muted">
            &gt; loading scanner <span className="animate-blink text-red">█</span>
          </div>
        }
      >
        <ScanBody params={params} />
      </Suspense>
    </div>
  );
}
