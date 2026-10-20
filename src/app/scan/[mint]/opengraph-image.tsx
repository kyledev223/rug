import { ImageResponse } from "next/og";
import { isValidPublicKey } from "@/lib/solana/address";
import { getCached } from "@/lib/scan/run";
import { repo } from "@/lib/db";
import { APP_NAME, DISCLAIMER } from "@/lib/config";
import type { RiskLabel } from "@/lib/scan/types";

export const alt = "Token risk score";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

let fontPromise: Promise<ArrayBuffer | null> | null = null;
/** JetBrains Mono TTF from Google Fonts (an old UA gets TTF instead of WOFF2). Optional. */
function loadFont(): Promise<ArrayBuffer | null> {
  fontPromise ??= (async () => {
    try {
      const css = await fetch("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700", {
        headers: { "user-agent": "Mozilla/4.0" },
        signal: AbortSignal.timeout(3000),
      }).then((r) => r.text());
      const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
      if (!url) return null;
      return await fetch(url, { signal: AbortSignal.timeout(3000) }).then((r) => r.arrayBuffer());
    } catch {
      return null;
    }
  })();
  return fontPromise;
}

const LABEL_COLORS: Record<RiskLabel, { bg: string; fg: string; border: string }> = {
  LOW: { bg: "#ffffff", fg: "#0a0a0a", border: "#0a0a0a" },
  MEDIUM: { bg: "#fef3c7", fg: "#92400e", border: "#f59e0b" },
  HIGH: { bg: "#ffe4e6", fg: "#b3121f", border: "#e11d2e" },
  CRITICAL: { bg: "#e11d2e", fg: "#ffffff", border: "#e11d2e" },
};

export default async function Image({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  let name = "Unknown token";
  let score: number | null = null;
  let label: RiskLabel | null = null;
  if (isValidPublicKey(mint)) {
    const c = await getCached(mint).catch(() => null);
    if (c) {
      name = c.report.token.symbol ? `$${c.report.token.symbol}` : c.report.token.name ?? name;
      score = c.report.score;
      label = c.report.label;
    } else {
      const last = await repo().latestScanForMint(mint).catch(() => null);
      if (last) {
        name = last.symbol ? `$${last.symbol}` : last.name ?? name;
        score = last.score;
        label = last.label;
      }
    }
  }
  const font = await loadFont();
  const lc = label ? LABEL_COLORS[label] : LABEL_COLORS.LOW;
  const short = `${mint.slice(0, 6)}…${mint.slice(-6)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "#ffffff",
          backgroundImage:
            "linear-gradient(to right, rgba(10,10,10,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,10,10,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          fontFamily: font ? "JetBrains Mono" : "sans-serif",
          color: "#0a0a0a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
            <span style={{ color: "#e11d2e" }}>&gt;_&nbsp;</span>
            {APP_NAME}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#52525b" }}>{short}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, maxWidth: 1060, overflow: "hidden" }}>{name}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 24, gap: 32 }}>
            <div style={{ display: "flex", alignItems: "baseline", fontSize: 160, fontWeight: 700, lineHeight: 1 }}>
              {score ?? "—"}
              <span style={{ fontSize: 48, color: "#71717a" }}>/100</span>
            </div>
            {label && (
              <div
                style={{
                  display: "flex",
                  fontSize: 48,
                  fontWeight: 700,
                  padding: "10px 28px",
                  border: `4px solid ${lc.border}`,
                  background: lc.bg,
                  color: lc.fg,
                  letterSpacing: 4,
                }}
              >
                {label}
              </div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#52525b", marginTop: 12 }}>
            {score === null ? "Scan this token for an evidence-backed risk report" : "risk score · higher = more risk signals"}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#b3121f", borderTop: "2px solid #e11d2e", paddingTop: 16 }}>{DISCLAIMER}</div>
      </div>
    ),
    { ...size, ...(font ? { fonts: [{ name: "JetBrains Mono", data: font, weight: 700 as const, style: "normal" as const }] } : {}) },
  );
}
