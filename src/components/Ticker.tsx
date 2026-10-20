"use client";

import { useEffect, useState } from "react";
import { DISCLAIMER } from "@/lib/config";

interface Stats {
  totalScans: number | null;
  flaggedToday: number | null;
  scansToday: number | null;
}

const FEATURES = [
  "14 rules-based checks per scan",
  "every warning ships with on-chain evidence",
  "mint + freeze authority",
  "Token-2022 extension audit",
  "LP burn status",
  "holder concentration, pools excluded",
  "funding-cluster heuristics",
  "unknown never counts as pass",
  "AI explains, rules decide",
];

export function Ticker() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/stats")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => alive && s && setStats(s))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const items: Array<{ text: string; live?: boolean }> = [];
  if (stats?.totalScans !== null && stats?.totalScans !== undefined) items.push({ text: `total scans ${stats.totalScans.toLocaleString("en-US")}`, live: true });
  if (stats?.flaggedToday !== null && stats?.flaggedToday !== undefined)
    items.push({ text: `tokens flagged HIGH+ today ${stats.flaggedToday.toLocaleString("en-US")}`, live: true });
  for (const f of FEATURES) items.push({ text: f });

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2 px-5 whitespace-nowrap">
          {it.live ? (
            <span aria-hidden className="size-1.5 rounded-full bg-red" />
          ) : (
            <span aria-hidden className="text-red">/</span>
          )}
          <span className={it.live ? "font-bold text-ink" : ""}>{it.text}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="border-y border-line bg-paper-2/90 backdrop-blur-sm">
      <div className="group relative flex overflow-hidden py-1.5 text-[11px] uppercase tracking-widest text-muted" role="marquee" aria-label="Features and live stats">
        <div className="flex animate-ticker group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          {row(false)}
          {row(true)}
        </div>
      </div>
      <p className="border-t border-line bg-red-tint/60 px-4 py-1 text-center text-[11px] font-bold text-red-dark">{DISCLAIMER}</p>
    </div>
  );
}
