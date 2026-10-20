"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { SessionProvider } from "./wallet/SessionProvider";

// The app never sends transactions from the browser; this endpoint only satisfies the provider.
const ENDPOINT = "https://api.mainnet-beta.solana.com";

export function Providers({ children }: { children: ReactNode }) {
  // Backpack and other Wallet Standard wallets are detected automatically.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <SessionProvider>{children}</SessionProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
