import "server-only";
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import { repo } from "@/lib/db";
import { sha256 } from "@/lib/http";
import { tierForWallet } from "./tier";
import type { TierDef } from "@/lib/config";

export const KEY_PREFIX = "rc_live_";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + bs58.encode(randomBytes(24));
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: sha256(key) };
}

export function readApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  const raw = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : req.headers.get("x-api-key")?.trim();
  if (!raw || !raw.startsWith(KEY_PREFIX) || raw.length > 80) return null;
  return raw;
}

export type ApiAuth =
  | { ok: true; keyId: string; wallet: string; tier: TierDef }
  | { ok: false; status: 401 | 403; code: string; message: string };

/** Resolves an API key to its wallet and confirms the wallet still qualifies for API access. */
export async function authenticateApiKey(req: Request): Promise<ApiAuth> {
  const key = readApiKey(req);
  if (!key) return { ok: false, status: 401, code: "missing_key", message: "Send your key as `Authorization: Bearer rc_live_…`." };
  const row = await repo().findApiKey(sha256(key));
  if (!row || row.revoked_at) return { ok: false, status: 401, code: "invalid_key", message: "Unknown or revoked API key." };
  const { tier } = await tierForWallet(row.wallet);
  if (!tier.apiKey) {
    return { ok: false, status: 403, code: "tier_required", message: "The wallet behind this key no longer holds enough for API access (tier 3)." };
  }
  return { ok: true, keyId: row.id, wallet: row.wallet, tier };
}
