/** Raydium v3 public API — LP burn percentage for Raydium pools. */

const BASE = "https://api-v3.raydium.io";

export interface RaydiumPoolLp {
  id: string;
  type: string; // "Standard" | "Concentrated"
  programId: string;
  burnPercent: number | null;
  lpMint: string | null;
}

export async function getRaydiumPools(ids: string[]): Promise<Record<string, RaydiumPoolLp>> {
  const out: Record<string, RaydiumPoolLp> = {};
  if (ids.length === 0) return out;
  const res = await fetch(`${BASE}/pools/info/ids?ids=${ids.slice(0, 20).join(",")}`, {
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Raydium HTTP ${res.status}`);
  const body = (await res.json()) as {
    success: boolean;
    data: Array<{
      id: string;
      type: string;
      programId: string;
      burnPercent?: number;
      lpMint?: { address: string };
    } | null>;
  };
  if (!body.success) throw new Error("Raydium API returned success=false");
  for (const p of body.data) {
    if (!p) continue;
    out[p.id] = {
      id: p.id,
      type: p.type,
      programId: p.programId,
      burnPercent: typeof p.burnPercent === "number" ? p.burnPercent : null,
      lpMint: p.lpMint?.address ?? null,
    };
  }
  return out;
}
