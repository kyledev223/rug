"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AlertRow, Watchlist } from "@/lib/db/types";
import { isValidPublicKey, shortAddr } from "@/lib/solana/address";
import { fmt } from "@/lib/scan/checks/util";
import { RiskBadge, btn, cx } from "@/components/ui";

interface Data {
  lists: Watchlist[];
  alerts: AlertRow[];
  limits: { watchlists: number; size: number; alerts: boolean };
}

async function api<T = unknown>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json as T;
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

export function WatchlistManager() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("/api/watchlists"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api("/api/watchlists/refresh", "POST");
    } catch {
      /* rate limited or upstream issue: keep showing last snapshots */
    }
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then(() => refresh());
  }, [load, refresh]);

  if (error && !data) return <p className="card p-4 text-sm text-red-dark">{error}</p>;
  if (!data) return <p className="card p-4 text-sm text-muted">loading watchlists…</p>;

  const unread = data.alerts.filter((a) => !a.read_at).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted">
            {data.lists.length}/{data.limits.watchlists} watchlists · {data.limits.size} tokens each
          </p>
          <button type="button" className={cx(btn.small, "ml-auto")} onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "re-checking…" : "↻ re-check now"}
          </button>
        </div>
        {error && <p className="text-xs font-bold text-red-dark">{error}</p>}

        {data.lists.length < data.limits.watchlists && (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/api/watchlists", "POST", { name: newName || "My watchlist" });
                setNewName("");
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <label htmlFor="new-list" className="sr-only">
              New watchlist name
            </label>
            <input
              id="new-list"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              placeholder="new watchlist name"
              className="min-w-0 flex-1 rounded-[3px] border border-line-2 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <button type="submit" className={btn.primary}>
              + create
            </button>
          </form>
        )}

        {data.lists.length === 0 && <p className="card p-4 text-sm text-muted">Create a watchlist to start tracking tokens.</p>}

        {data.lists.map((l) => (
          <ListCard key={l.id} list={l} limits={data.limits} onChange={load} onError={setError} />
        ))}
      </div>

      <aside aria-labelledby="alerts-h" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="alerts-h" className="font-mono text-sm font-bold tracking-normal">
            alerts {unread > 0 && <span className="ml-1 rounded-[2px] bg-red px-1.5 text-[11px] text-white">{unread} new</span>}
          </h2>
          {unread > 0 && (
            <button
              type="button"
              className="ml-auto text-[11px] text-muted underline hover:text-red-dark"
              onClick={async () => {
                await api("/api/alerts/read", "POST").catch(() => {});
                await load();
              }}
            >
              mark all read
            </button>
          )}
        </div>
        {!data.limits.alerts && (
          <p className="card border-dashed p-3 text-xs text-muted">
            Risk-change alerts unlock at Holder II. Your watchlist still re-checks scores when you visit.{" "}
            <Link href="/token" className="link">
              tiers
            </Link>
          </p>
        )}
        {data.limits.alerts && data.alerts.length === 0 && (
          <p className="card p-3 text-xs text-muted">No alerts yet. You&apos;ll see liquidity pulls, authority changes, big holder sells and risk changes here.</p>
        )}
        <ul className="space-y-2">
          {data.alerts.map((a) => (
            <li key={a.id} className={cx("card p-3 text-xs", !a.read_at && "border-red/60")}>
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted">
                {!a.read_at && <span aria-hidden className="size-1.5 rounded-full bg-red" />}
                {a.kind.replace("_", " ")} · {ago(a.created_at)}
              </p>
              <p className="mt-1">{a.message}</p>
              <Link href={`/scan/${a.mint}`} className="link mt-1 inline-block text-[11px]">
                open report →
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function ListCard({
  list,
  limits,
  onChange,
  onError,
}: {
  list: Watchlist;
  limits: Data["limits"];
  onChange: () => Promise<void>;
  onError: (e: string) => void;
}) {
  const [mint, setMint] = useState("");
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const m = mint.trim();
    if (!isValidPublicKey(m)) return onError("That isn't a valid mint address.");
    setAdding(true);
    try {
      await api(`/api/watchlists/${list.id}/items`, "POST", { mint: m });
      setMint("");
      await onChange();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="card" aria-label={`Watchlist ${list.name}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="font-display text-lg font-bold">{list.name}</h2>
        <span className="text-xs text-muted">
          {list.items.length}/{limits.size}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" className={btn.small} onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            ⚙ alerts
          </button>
          <button
            type="button"
            className={btn.small}
            onClick={async () => {
              if (!confirm(`Delete watchlist "${list.name}"?`)) return;
              await api(`/api/watchlists/${list.id}`, "DELETE").catch((e) => onError(String(e.message ?? e)));
              await onChange();
            }}
          >
            delete
          </button>
        </div>
      </div>

      {showSettings && <AlertSettings list={list} enabled={limits.alerts} onSaved={onChange} onError={onError} />}

      {list.items.length > 0 ? (
        <div className="scroll-x">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="border-b border-line text-[10px] uppercase tracking-widest text-muted">
              <tr>
                <th className="px-4 py-2">token</th>
                <th className="px-4 py-2 text-right">score</th>
                <th className="px-4 py-2 text-right">liquidity</th>
                <th className="px-4 py-2">checked</th>
                <th className="px-4 py-2">
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((it) => (
                <tr key={it.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <Link className="link font-bold" href={`/scan/${it.mint}`}>
                      {it.symbol ? `$${it.symbol}` : it.name ?? shortAddr(it.mint)}
                    </Link>
                    <span className="block text-[10px] text-faint">{shortAddr(it.mint)}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {it.snapshot ? (
                      <span className="inline-flex items-center gap-2">
                        <b className="tabular-nums">{it.snapshot.score}</b>
                        <RiskBadge label={it.snapshot.label} size="sm" />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt.usd(it.snapshot?.liquidityUsd ?? null)}</td>
                  <td className="px-4 py-2 text-muted">{ago(it.checked_at)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-muted hover:text-red-dark"
                      aria-label={`Remove ${it.symbol ?? it.mint}`}
                      onClick={async () => {
                        await api(`/api/watchlists/${list.id}/items?mint=${it.mint}`, "DELETE").catch((e) => onError(String(e.message ?? e)));
                        await onChange();
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted">No tokens yet.</p>
      )}

      {list.items.length < limits.size && (
        <form onSubmit={add} className="flex gap-2 border-t border-line px-4 py-3">
          <label htmlFor={`add-${list.id}`} className="sr-only">
            Add token mint
          </label>
          <input
            id={`add-${list.id}`}
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            spellCheck={false}
            placeholder="add mint address"
            className="min-w-0 flex-1 rounded-[3px] border border-line-2 bg-paper px-3 py-1.5 font-mono text-xs outline-none focus:border-ink"
          />
          <button type="submit" className={btn.small} disabled={adding}>
            {adding ? "scanning…" : "+ add"}
          </button>
        </form>
      )}
    </section>
  );
}

function AlertSettings({
  list,
  enabled,
  onSaved,
  onError,
}: {
  list: Watchlist;
  enabled: boolean;
  onSaved: () => Promise<void>;
  onError: (e: string) => void;
}) {
  const [s, setS] = useState({
    alert_score_change: list.alert_score_change,
    alert_authority: list.alert_authority,
    alert_liquidity_drop_pct: list.alert_liquidity_drop_pct,
    alert_holder_dump_pct: list.alert_holder_dump_pct,
    webhook_url: list.webhook_url ?? "",
  });
  const [saved, setSaved] = useState(false);

  if (!enabled) {
    return (
      <p className="border-b border-line bg-paper-2 px-4 py-3 text-xs text-muted">
        Alerts unlock at Holder II. <Link href="/token" className="link">See tiers</Link>
      </p>
    );
  }
  return (
    <form
      className="grid gap-3 border-b border-line bg-paper-2 px-4 py-3 text-xs sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/watchlists/${list.id}`, "PATCH", s);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
          await onSaved();
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.alert_score_change} onChange={(e) => setS({ ...s, alert_score_change: e.target.checked })} className="accent-red" />
        risk label changes or score moves ≥ 10
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.alert_authority} onChange={(e) => setS({ ...s, alert_authority: e.target.checked })} className="accent-red" />
        mint / freeze authority changes
      </label>
      <label className="flex items-center gap-2">
        liquidity drops ≥
        <input
          type="number"
          min={0}
          max={95}
          value={s.alert_liquidity_drop_pct}
          onChange={(e) => setS({ ...s, alert_liquidity_drop_pct: Number(e.target.value) })}
          className="w-16 rounded-[3px] border border-line-2 bg-paper px-2 py-1"
        />
        % <span className="text-faint">(0 = off)</span>
      </label>
      <label className="flex items-center gap-2">
        a top holder sells ≥
        <input
          type="number"
          min={0}
          max={50}
          step={0.5}
          value={s.alert_holder_dump_pct}
          onChange={(e) => setS({ ...s, alert_holder_dump_pct: Number(e.target.value) })}
          className="w-16 rounded-[3px] border border-line-2 bg-paper px-2 py-1"
        />
        % of supply
      </label>
      <label className="sm:col-span-2">
        <span className="text-muted">Discord webhook (optional): alerts are also posted there</span>
        <input
          type="url"
          value={s.webhook_url}
          onChange={(e) => setS({ ...s, webhook_url: e.target.value })}
          placeholder="https://discord.com/api/webhooks/…"
          className="mt-1 w-full rounded-[3px] border border-line-2 bg-paper px-2 py-1 font-mono"
        />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" className={btn.small}>
          save
        </button>
        {saved && <span className="text-ok">saved ✓</span>}
        <span className="ml-auto text-faint">Watched tokens are re-checked roughly every 30 minutes, and when you open this page.</span>
      </div>
    </form>
  );
}
