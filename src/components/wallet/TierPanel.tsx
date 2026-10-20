"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { TIERS, TOKEN_TICKER } from "@/lib/config";
import { btn, cx } from "@/components/ui";
import { useSession } from "./SessionProvider";
import { WalletModal } from "./WalletModal";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function TierPanel() {
  const { connected } = useWallet();
  const { session, loading, needsVerify, verify, verifying, refresh, error } = useSession();
  const [modal, setModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (loading) return <div className="card p-5 text-sm text-muted">loading session…</div>;

  const verified = Boolean(session?.wallet) && !needsVerify;
  const tier = session?.tier ?? 0;

  return (
    <div className="card overflow-hidden">
      <div className="grid gap-px bg-line md:grid-cols-[1.2fr_1fr]">
        <div className="bg-paper p-5">
          <p className="text-[11px] uppercase tracking-widest text-muted">your tier</p>
          <p className="mt-1 font-display text-3xl font-bold">
            T{tier} · {TIERS[tier].name}
          </p>
          {verified && session ? (
            <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
              <dt className="text-muted">wallet</dt>
              <dd className="break-all">{session.wallet}</dd>
              <dt className="text-muted">balance</dt>
              <dd>
                <b>{num(session.balance)}</b> {TOKEN_TICKER}
              </dd>
              <dt className="text-muted">checked</dt>
              <dd>
                {session.checkedAt ? new Date(session.checkedAt).toLocaleString() : "—"}
                <span className="text-faint"> · auto re-check after {session.nextCheckAt ? new Date(session.nextCheckAt).toLocaleTimeString() : "—"}</span>
              </dd>
              <dt className="text-muted">scans today</dt>
              <dd>
                {session.usage.scansToday}
                {session.usage.dailyLimit === null ? " (unlimited)" : ` / ${session.usage.dailyLimit}`}
              </dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {session?.usage
                ? `Free tier: ${session.usage.scansToday} / ${session.usage.dailyLimit ?? "∞"} scans used today on this IP.`
                : "Free tier."}{" "}
              Verify a wallet to unlock holder perks.
            </p>
          )}
          {!session?.tokenLaunched && (
            <p className="mt-3 rounded-[3px] border border-dashed border-amber-line bg-amber-bg/60 p-2 text-xs text-amber">
              {TOKEN_TICKER} hasn&apos;t launched yet, so every wallet is on the free tier for now. Verification works today and tiers
              apply automatically at launch.
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
            {verified && (
              <button
                type="button"
                className={btn.ghost}
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  await refresh();
                  setRefreshing(false);
                }}
              >
                {refreshing ? "checking…" : "↻ re-check balance"}
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs font-bold text-red-dark">
              {error}
            </p>
          )}
        </div>
        <div className="bg-paper-2 p-5">
          {session?.next ? (
            <>
              <p className="text-[11px] uppercase tracking-widest text-muted">next: T{session.next.tier} · {session.next.name}</p>
              <p className="mt-1 text-sm">
                Hold <b>{num(session.next.minBalance)}</b> {TOKEN_TICKER}
                {verified && session.next.needed > 0 && <span className="text-muted"> ({num(session.next.needed)} more)</span>}
              </p>
              {verified && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-[1px] bg-line" aria-hidden>
                  <div
                    className="h-full bg-red"
                    style={{ width: `${Math.min(100, (session.balance / session.next.minBalance) * 100)}%` }}
                  />
                </div>
              )}
              <ul className="mt-3 space-y-1 text-xs">
                {session.next.perks.map((p) => (
                  <li key={p}>
                    <span className="text-red">+</span> {p}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm">You&apos;re on the top tier. Everything is unlocked.</p>
          )}
          <p className={cx("mt-4 border-t border-dashed border-line pt-3 text-[11px] font-bold text-red-dark")}>
            We never ask for your seed phrase or private key. Verification is a free message signature: no transaction, no approvals.
          </p>
        </div>
      </div>
      <WalletModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
