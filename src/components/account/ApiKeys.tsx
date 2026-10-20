"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiKeyRow } from "@/lib/db/types";
import { btn } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";

export function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/keys", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (r.ok) setKeys(j.keys);
    else setError(j?.error?.message ?? "Couldn't load keys.");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) return setError(j?.error?.message ?? "Couldn't create key.");
    setFresh(j.key);
    setName("");
    await load();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Apps using it will stop working.")) return;
    await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="card p-4">
      {fresh && (
        <div className="mb-4 rounded-[3px] border border-red bg-red-tint/50 p-3" role="status">
          <p className="text-xs font-bold text-red-dark">Copy your key now. It won&apos;t be shown again.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-[2px] bg-paper px-2 py-1 text-xs">{fresh}</code>
            <CopyButton value={fresh} label="copy key" />
            <button type="button" className="text-[11px] text-muted underline" onClick={() => setFresh(null)}>
              done
            </button>
          </div>
        </div>
      )}
      <form onSubmit={create} className="flex gap-2">
        <label htmlFor="key-name" className="sr-only">
          Key name
        </label>
        <input
          id="key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="key name (e.g. trading-bot)"
          className="min-w-0 flex-1 rounded-[3px] border border-line-2 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <button type="submit" className={btn.primary}>
          + new key
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-bold text-red-dark">{error}</p>}
      <ul className="mt-4 divide-y divide-line text-xs">
        {keys === null && <li className="py-2 text-muted">loading…</li>}
        {keys?.length === 0 && <li className="py-2 text-muted">No keys yet.</li>}
        {keys?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <code className={k.revoked_at ? "text-faint line-through" : ""}>{k.prefix}…</code>
            <span>{k.name}</span>
            <span className="text-faint">
              created {new Date(k.created_at).toLocaleDateString()} · last used {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
            </span>
            {k.revoked_at ? (
              <span className="ml-auto text-faint">revoked</span>
            ) : (
              <button type="button" className="ml-auto text-red-dark underline" onClick={() => void revoke(k.id)}>
                revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted">Keys are stored as SHA-256 hashes. They stop working if your wallet drops below tier 3.</p>
    </div>
  );
}
