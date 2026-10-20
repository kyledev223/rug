import bs58 from "bs58";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** True when `s` is base58 and decodes to exactly 32 bytes (a Solana public key). */
export function isValidPublicKey(s: unknown): s is string {
  if (typeof s !== "string" || !BASE58_RE.test(s)) return false;
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
}

export function shortAddr(a: string, n = 4): string {
  return a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
}

/** Parse a free-form list of mints (newlines, commas, spaces). Dedupes, keeps order. */
export function parseMintList(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    (isValidPublicKey(p) ? valid : invalid).push(p);
  }
  return { valid, invalid };
}
