"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { TIERS, TOKEN_TICKER } from "@/lib/config";
import { btn } from "@/components/ui";
import { useSession } from "./SessionProvider";
import { WalletModal } from "./WalletModal";

/** Renders children only for verified wallets at or above `minTier`; otherwise explains how to unlock. */
export function TierGate({ minTier, feature, children }: { minTier: 1 | 2 | 3; feature: string; children: ReactNode }) {
  const { connected } = useWallet();
  const { session, loading, needsVerify, verify, verifying, error } = useSession();
  const [modal, setModal] = useState(false);

  if (loading) return <div className="card p-5 text-sm text-muted">checking access…</div>;
  const verified = Boolean(session?.wallet) && !needsVerify;
  if (verified && session && session.tier >= minTier) return <>{children}</>;

  const t = TIERS[minTier];
  return (
    <div className="card border-dashed p-6">
      <p className="label-num">locked · tier {minTier}+</p>
      <h2 className="mt-2 text-2xl font-bold">{feature} unlocks at {t.name}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Hold at least <b className="text-ink">{t.minBalance.toLocaleString("en-US")} {TOKEN_TICKER}</b> and verify your wallet with a free
        message signature. No transaction, no approvals.
      </p>
      {verified && session && (
        <p className="mt-2 text-sm">
          Your wallet is on tier {session.tier} ({session.tierName}) with {session.balance.toLocaleString("en-US")} {TOKEN_TICKER}.
          {!session.tokenLaunched && " The token hasn't launched yet, so holder tiers aren't active."}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!connected && !verified && (
          <button type="button" className={btn.primary} onClick={() => setModal(true)}>
            &gt;_ connect wallet
          </button>
        )}
        {connected && needsVerify && (
          <button type="button" className={btn.primary} disabled={verifying} onClick={() => void verify()}>
            {verifying ? "approve in wallet…" : ">_ sign message to verify"}
          </button>
        )}
        <Link href="/token" className={btn.ghost}>
          see all tiers
        </Link>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-red-dark">{error}</p>}
      <p className="mt-4 text-[11px] font-bold text-red-dark">We never ask for your seed phrase or private key.</p>
      <WalletModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
