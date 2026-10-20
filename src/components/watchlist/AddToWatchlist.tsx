"use client";

import { useState } from "react";
import Link from "next/link";
import type { Watchlist } from "@/lib/db/types";
import { btn } from "@/components/ui";
import { useSession } from "@/components/wallet/SessionProvider";

export function AddToWatchlist({ mint }: { mint: string }) {
  const { session, needsVerify } = useSession();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!session?.wallet || needsVerify || !session.features.watchlists) return null;

  async function toggle() {
    setOpen((o) => !o);
    setMsg(null);
    if (!lists) {
      const r = await fetch("/api/watchlists", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      setLists(j?.lists ?? []);
    }
  }

  async function add(listId: string) {
    setMsg("adding…");
    const r = await fetch(`/api/watchlists/${listId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint }),
    });
    const j = await r.json().catch(() => null);
    setMsg(r.ok ? "added ✓" : (j?.error?.message ?? "couldn't add"));
  }

  return (
    <div className="relative">
      <button type="button" className={btn.small} onClick={() => void toggle()} aria-expanded={open}>
        + watchlist
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-60 card bg-paper p-2 text-xs">
          {lists === null && <p className="p-1 text-muted">loading…</p>}
          {lists?.length === 0 && (
            <p className="p-1 text-muted">
              No watchlists yet. <Link className="link" href="/watchlist">create one</Link>
            </p>
          )}
          {lists?.map((l) => (
            <button key={l.id} type="button" className="block w-full rounded-[2px] p-1.5 text-left hover:bg-red-tint" onClick={() => void add(l.id)}>
              {l.name} <span className="text-faint">({l.items.length})</span>
            </button>
          ))}
          {msg && <p className="p-1 font-bold">{msg}</p>}
        </div>
      )}
    </div>
  );
}
