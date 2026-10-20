"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { shortAddr } from "@/lib/solana/address";
import { btn, cx } from "@/components/ui";
import { WalletModal } from "./WalletModal";
import { useSession } from "./SessionProvider";

export function WalletButton() {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { session, needsVerify, verify, verifying, logout, error, clearError } = useSession();
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const verified = session?.wallet && !needsVerify;

  let main;
  if (verified) {
    main = (
      <button type="button" className={cx(btn.small, "py-1.5")} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
        <span aria-hidden className="size-1.5 rounded-full bg-red" />
        <span className="hidden sm:inline">{shortAddr(session.wallet!)}</span>
        <span className="font-bold">T{session.tier}</span>
      </button>
    );
  } else if (connected && publicKey) {
    main = (
      <button type="button" className={cx(btn.primary, "px-3 py-1.5 text-xs")} disabled={verifying} onClick={() => void verify()}>
        {verifying ? "check wallet…" : ">_ verify"}
      </button>
    );
  } else {
    main = (
      <button type="button" className={cx(btn.primary, "px-3 py-1.5 text-xs")} disabled={connecting} onClick={() => setModal(true)}>
        {connecting ? "connecting…" : ">_ connect"}
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      {main}
      {connected && !verified && (
        <button type="button" className="ml-1 text-[11px] text-muted underline hover:text-red-dark" onClick={() => void disconnect()}>
          disconnect
        </button>
      )}
      {menu && verified && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 card bg-paper p-3 text-xs shadow-[4px_4px_0_0_rgb(10_10_10/0.08)]">
          <p className="text-muted">verified wallet</p>
          <p className="break-all font-bold">{session.wallet}</p>
          <p className="mt-2">
            tier {session.tier} · <b>{session.tierName}</b>
          </p>
          <div className="mt-3 flex flex-col gap-1 border-t border-line pt-2">
            <Link role="menuitem" href="/account" className="hover:text-red-dark" onClick={() => setMenu(false)}>
              /account — tier, history, keys
            </Link>
            <Link role="menuitem" href="/watchlist" className="hover:text-red-dark" onClick={() => setMenu(false)}>
              /watchlist
            </Link>
            <button
              role="menuitem"
              type="button"
              className="text-left text-red-dark hover:text-red"
              onClick={async () => {
                setMenu(false);
                await logout();
                await disconnect().catch(() => {});
              }}
            >
              sign out
            </button>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="absolute right-0 z-50 mt-2 w-64 card border-red bg-paper p-3 text-xs">
          <p className="text-red-dark">{error}</p>
          <button type="button" className="mt-1 text-muted underline" onClick={clearError}>
            dismiss
          </button>
        </div>
      )}
      <WalletModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
