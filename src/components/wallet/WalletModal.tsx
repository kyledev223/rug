"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { btn, cx } from "@/components/ui";

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { wallets, select, wallet, connecting } = useWallet();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const usable = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  const others = wallets.filter((w) => w.readyState === WalletReadyState.NotDetected);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-[4px] border border-ink bg-paper p-0 text-ink backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
      aria-labelledby="wallet-modal-title"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <p id="wallet-modal-title" className="font-mono text-sm font-bold">
          <span className="text-red">&gt;_</span> connect wallet
        </p>
        <button type="button" onClick={onClose} className="px-2 text-lg leading-none text-muted hover:text-red-dark" aria-label="Close">
          ×
        </button>
      </div>
      {/* Wallet detection only happens in the browser, so render the list only when open. */}
      {open && (
      <div className="p-4">
        {usable.length === 0 && <p className="text-sm text-muted">No Solana wallet detected in this browser.</p>}
        <ul className="space-y-2">
          {usable.map((w) => (
            <li key={w.adapter.name}>
              <button
                type="button"
                disabled={connecting}
                onClick={() => {
                  select(w.adapter.name);
                  onClose();
                }}
                className={cx(btn.ghost, "w-full justify-start", wallet?.adapter.name === w.adapter.name && "border-red")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.adapter.icon} alt="" width={20} height={20} className="size-5" />
                {w.adapter.name}
                <span className="ml-auto text-[10px] uppercase tracking-widest text-muted">detected</span>
              </button>
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] uppercase tracking-widest text-muted">not installed</p>
            <ul className="flex flex-wrap gap-2">
              {others.map((w) => (
                <li key={w.adapter.name}>
                  <a href={w.adapter.url} target="_blank" rel="noopener noreferrer" className={btn.small}>
                    get {w.adapter.name} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 space-y-1 border-t border-dashed border-line pt-3 text-xs text-muted">
          <p>
            <b className="text-ink">Verification = one free message signature.</b> No transaction, no approvals, no fees.
          </p>
          <p className="font-bold text-red-dark">We will never ask for your seed phrase or private key.</p>
        </div>
      </div>
      )}
    </dialog>
  );
}
