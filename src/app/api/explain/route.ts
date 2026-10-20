import { isValidPublicKey } from "@/lib/solana/address";
import { clientIp, hashIp, jsonError, readJson, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getCached, saveExplanation } from "@/lib/scan/run";
import { templateExplanation } from "@/lib/scan/explain";
import { aiExplanation, geminiConfigured } from "@/lib/ai/gemini";

export const maxDuration = 30;

/** Upgrades a cached report's template explanation to an AI one (if available). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "forbidden", "Cross-origin request rejected.");
  const body = await readJson<{ mint?: unknown }>(req);
  const mint = typeof body?.mint === "string" ? body.mint.trim() : "";
  if (!isValidPublicKey(mint)) return jsonError(400, "invalid_mint", "Invalid mint address.");

  const cached = await getCached(mint);
  if (!cached) return jsonError(404, "not_cached", "Scan this token first.");
  if (cached.explanation?.source === "ai") return Response.json({ explanation: cached.explanation });

  const fallback = () => Response.json({ explanation: templateExplanation(cached.report) });
  if (!geminiConfigured()) return fallback();

  const ipLimit = await rateLimit(`explain:ip:${hashIp(clientIp(req))}`, 10, 60);
  // Global cap keeps us inside the Gemini free-tier request quota.
  const globalLimit = await rateLimit("explain:global", 9, 60);
  if (!ipLimit.ok || !globalLimit.ok) return fallback();

  const ai = await aiExplanation(cached.report);
  if (!ai) return fallback();
  await saveExplanation(mint, cached.report, ai);
  return Response.json({ explanation: ai });
}
