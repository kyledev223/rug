import { randomBytes } from "node:crypto";
import { isValidPublicKey } from "@/lib/solana/address";
import { clientIp, hashIp, jsonError, readJson, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { repo } from "@/lib/db";
import { buildSignInMessage } from "@/lib/auth/message";
import { logError } from "@/lib/log";

const NONCE_TTL_MS = 5 * 60_000;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "forbidden", "Cross-origin request rejected.");
  const body = await readJson<{ wallet?: unknown }>(req, 1024);
  const wallet = typeof body?.wallet === "string" ? body.wallet : "";
  if (!isValidPublicKey(wallet)) return jsonError(400, "invalid_wallet", "Invalid wallet address.");

  const rl = await rateLimit(`nonce:${hashIp(clientIp(req))}`, 10, 60);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many sign-in attempts. Wait a minute.");

  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const domain = new URL(req.url).host;
  const message = buildSignInMessage({ wallet, nonce, issuedAt, domain });
  try {
    await repo().createNonce(nonce, wallet, message, new Date(Date.now() + NONCE_TTL_MS));
  } catch (e) {
    logError("auth/nonce", e);
    return jsonError(503, "storage_error", "Sign-in is temporarily unavailable.");
  }
  return Response.json({ nonce, message, expiresInSec: NONCE_TTL_MS / 1000 });
}
