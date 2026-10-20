import Link from "next/link";
import { APP_NAME, DISCLAIMER, TOKEN_TICKER } from "@/lib/config";
import { AsciiLogo } from "./AsciiLogo";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-paper/90">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div>
            <AsciiLogo />
          </div>
          <p className="mt-4 max-w-sm text-xs text-muted">
            {APP_NAME} reads public on-chain and market data and applies fixed rules. It never asks for your seed phrase or
            private key, and never requests a transaction.
          </p>
        </div>
        <nav aria-label="Product" className="flex flex-col gap-1 text-sm">
          <p className="mb-1 text-[11px] uppercase tracking-widest text-muted">product</p>
          <Link className="hover:text-red-dark" href="/#scan">/scan</Link>
          <Link className="hover:text-red-dark" href="/bulk">/bulk</Link>
          <Link className="hover:text-red-dark" href="/watchlist">/watchlist</Link>
          <Link className="hover:text-red-dark" href="/account">/account</Link>
        </nav>
        <nav aria-label="Learn" className="flex flex-col gap-1 text-sm">
          <p className="mb-1 text-[11px] uppercase tracking-widest text-muted">learn</p>
          <Link className="hover:text-red-dark" href="/docs">/docs — methodology</Link>
          <Link className="hover:text-red-dark" href="/api-docs">/api-docs</Link>
          <Link className="hover:text-red-dark" href="/token">/token — {TOKEN_TICKER}</Link>
        </nav>
      </div>
      <div className="border-t border-line px-4 py-4 text-center text-[11px] text-red-dark">{DISCLAIMER}</div>
    </footer>
  );
}
