import { requireWallet } from "@/lib/auth/guard";
import { withViewer } from "@/lib/auth/viewer";
import { generateApiKey } from "@/lib/auth/apikey";
import { repo } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { logError } from "@/lib/log";

const allow = (t: { apiKey: boolean }) => t.apiKey;
const MAX_ACTIVE = 3;

export async function GET(req: Request) {
  const g = await requireWallet(req, allow, { feature: "API keys", minTier: 3 });
  if (!g.ok) return g.res;
  try {
    const keys = await repo().listApiKeys(g.viewer.wallet);
    return withViewer(g.viewer, Response.json({ keys }, { headers: { "cache-control": "no-store" } }));
  } catch (e) {
    logError("api/keys", e);
    return jsonError(503, "storage_error", "API keys are temporarily unavailable.");
  }
}

export async function POST(req: Request) {
  const g = await requireWallet(req, allow, { feature: "API keys", minTier: 3, limit: 10 });
  if (!g.ok) return g.res;
  const body = await readJson<{ name?: unknown }>(req, 1024);
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : "default";
  try {
    const active = (await repo().listApiKeys(g.viewer.wallet)).filter((k) => !k.revoked_at);
    if (active.length >= MAX_ACTIVE) return jsonError(403, "limit_reached", `Revoke a key first (max ${MAX_ACTIVE} active).`);
    const { key, prefix, hash } = generateApiKey();
    const row = await repo().createApiKey(g.viewer.wallet, name, prefix, hash);
    // The plaintext key is returned exactly once and never stored.
    return withViewer(g.viewer, Response.json({ key, apiKey: row }, { status: 201, headers: { "cache-control": "no-store" } }));
  } catch (e) {
    logError("api/keys:create", e);
    return jsonError(503, "storage_error", "Couldn't create a key.");
  }
}

export async function DELETE(req: Request) {
  const g = await requireWallet(req, allow, { feature: "API keys", minTier: 3, limit: 10 });
  if (!g.ok) return g.res;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(400, "invalid_id", "Invalid key id.");
  try {
    const ok = await repo().revokeApiKey(g.viewer.wallet, id);
    if (!ok) return jsonError(404, "not_found", "Key not found or already revoked.");
    return withViewer(g.viewer, Response.json({ ok: true }));
  } catch (e) {
    logError("api/keys:revoke", e);
    return jsonError(503, "storage_error", "Couldn't revoke the key.");
  }
}
