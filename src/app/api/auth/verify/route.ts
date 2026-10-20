import { isValidPublicKey } from "@/lib/solana/address";
import { clientIp, hashIp, jsonError, readJson, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { repo } from "@/lib/db";
import { verifyWalletSignature } from "@/lib/auth/verify";
import { checkTier } from "@/lib/auth/tier";
import { SESSION_TTL_MS, encodeSession, sessionCookie } from "@/lib/auth/session";
import { sessionInfo } from "@/lib/auth/info";
import { logError } from "@/lib/log";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "forbidden", "Cross-origin request rejected.");
  const body = await readJson<{ wallet?: unknown; nonce?: unknown; signature?: unknown }>(req, 2048);
  const wallet = typeof body?.wallet === "string" ? body.wallet : "";
  const nonce = typeof body?.nonce === "string" && /^[a-f0-9]{32}$/.test(body.nonce) ? body.nonce : "";
  const signature = typeof body?.signature === "string" && body.signature.length <= 128 ? body.signature : "";
  if (!isValidPublicKey(wallet) || !nonce || !signature) return jsonError(400, "invalid_request", "Missing or invalid fields.");

  const rl = await rateLimit(`verify:${hashIp(clientIp(req))}`, 10, 60);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many sign-in attempts. Wait a minute.");

  let message: string | null;
  try {
    // Consumed atomically: a nonce works once, for this wallet, before it expires.
    message = await repo().consumeNonce(nonce, wallet);
  } catch (e) {
    logError("auth/verify", e);
    return jsonError(503, "storage_error", "Sign-in is temporarily unavailable.");
  }
  if (!message) return jsonError(401, "nonce_invalid", "This sign-in request expired or was already used. Try again.");
  if (!verifyWalletSignature(message, signature, wallet)) {
    return jsonError(401, "bad_signature", "Signature did not match this wallet.");
  }

  let check;
  try {
    check = await checkTier(wallet);
  } catch (e) {
    logError("auth/verify:balance", e);
    return jsonError(502, "balance_unavailable", "Signature verified, but the token balance couldn't be read. Try again shortly.");
  }
  const now = Date.now();
  const cookie = sessionCookie(
    encodeSession({ w: wallet, t: check.tier.id, b: check.balance, c: check.checkedAt, iat: now, exp: now + SESSION_TTL_MS }),
  );
  const info = await sessionInfo({
    ip: clientIp(req),
    ipHash: hashIp(clientIp(req)),
    wallet,
    tier: check.tier,
    balance: check.balance,
    checkedAt: check.checkedAt,
  });
  return Response.json({ session: info }, { headers: { "set-cookie": cookie } });
}
