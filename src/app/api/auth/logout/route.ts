import { clearSessionCookie } from "@/lib/auth/session";
import { jsonError, sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "forbidden", "Cross-origin request rejected.");
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}
