/** Helius DAS (Digital Asset Standard) — token metadata, mutability, creators. */
import { hasHelius, rpc } from "./rpc";

export interface DasAsset {
  name: string | null;
  symbol: string | null;
  image: string | null;
  jsonUri: string | null;
  mutable: boolean | null;
  updateAuthority: string | null;
  creators: string[];
  externalUrl: string | null;
}

interface RawAsset {
  content?: {
    json_uri?: string;
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string; external_url?: string };
    files?: Array<{ uri?: string; cdn_uri?: string }>;
  };
  authorities?: Array<{ address: string; scopes: string[] }>;
  creators?: Array<{ address: string; share: number; verified: boolean }>;
  mutable?: boolean;
}

export function dasAvailable(): boolean {
  return hasHelius();
}

export async function getAsset(mint: string): Promise<DasAsset> {
  const a = await rpc<RawAsset>("getAsset", { id: mint });
  const updateAuth =
    a.authorities?.find((x) => x.scopes.includes("full") || x.scopes.includes("metadata"))?.address ?? null;
  return {
    name: a.content?.metadata?.name?.trim() || null,
    symbol: a.content?.metadata?.symbol?.trim() || null,
    image: a.content?.links?.image || a.content?.files?.[0]?.cdn_uri || a.content?.files?.[0]?.uri || null,
    jsonUri: a.content?.json_uri || null,
    mutable: typeof a.mutable === "boolean" ? a.mutable : null,
    updateAuthority: updateAuth,
    creators: (a.creators ?? []).map((c) => c.address),
    externalUrl: a.content?.links?.external_url || null,
  };
}

/** Token creators control the metadata URI, so refuse obvious internal targets. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return true;
  if (/^(10|127|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h.includes(":")) return true; // IPv6 literals
  return false;
}

export interface OffchainSocials {
  website: string | null;
  twitter: string | null;
  telegram: string | null;
}

/** Off-chain metadata JSON often carries socials. Best-effort, short timeout, https only. */
export async function getOffchainSocials(jsonUri: string): Promise<OffchainSocials> {
  const empty = { website: null, twitter: null, telegram: null };
  let url: URL;
  try {
    url = new URL(jsonUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/"));
  } catch {
    return empty;
  }
  if (url.protocol !== "https:" || isPrivateHost(url.hostname)) return empty;
  const res = await fetch(url, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
  if (!res.ok) return empty;
  const text = await res.text();
  if (text.length > 200_000) return empty;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    return empty;
  }
  const ext = (j.extensions && typeof j.extensions === "object" ? j.extensions : {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = j[k] ?? ext[k];
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
    return null;
  };
  return {
    website: pick("website", "external_url"),
    twitter: pick("twitter", "x"),
    telegram: pick("telegram"),
  };
}
