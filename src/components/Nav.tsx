"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { AsciiLogo } from "./AsciiLogo";
import { cx } from "./ui";

export const NAV_LINKS = [
  { href: "/#scan", label: "/scan", match: "/scan" },
  { href: "/bulk", label: "/bulk", match: "/bulk" },
  { href: "/watchlist", label: "/watchlist", match: "/watchlist" },
  { href: "/docs", label: "/docs", match: "/docs" },
  { href: "/token", label: "/token", match: "/token" },
];

function ActiveNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinksInner path={usePathname()} onNavigate={onNavigate} />;
}

/** usePathname suspends while dynamic routes prerender; fall back to links without active state. */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavLinksInner path="" onNavigate={onNavigate} />}>
      <ActiveNavLinks onNavigate={onNavigate} />
    </Suspense>
  );
}

function NavLinksInner({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_LINKS.map((l) => {
        const active = path === l.match || path.startsWith(`${l.match}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "px-2 py-1 font-mono text-sm transition-colors hover:text-red-dark",
              active ? "text-red-dark underline decoration-red underline-offset-4" : "text-ink-2",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}

export function Nav({ wallet }: { wallet?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <Link href="/" className="shrink-0" aria-label="Home">
          <AsciiLogo height={18} />
        </Link>
        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 md:flex">
          <NavLinks />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {wallet}
          <button
            type="button"
            className="grid size-9 place-items-center rounded-[3px] border border-line-2 font-mono text-sm md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "×" : "≡"}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="flex flex-col border-t border-line px-2 py-2 md:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </header>
  );
}
