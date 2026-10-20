import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { runAlertSweep } from "@/lib/alerts/run";
import { logError, logInfo } from "@/lib/log";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Called by Vercel Cron (daily on Hobby) and optionally by the GitHub Actions workflow. */
export async function GET(req: Request) {
  if (!authorized(req)) return jsonError(401, "unauthorized", "Missing or invalid cron secret.");
  try {
    const res = await runAlertSweep();
    logInfo("cron/alerts", `checked=${res.checked} alerts=${res.alerts}`);
    return Response.json({ ok: true, ...res });
  } catch (e) {
    logError("cron/alerts", e);
    return jsonError(500, "sweep_failed", "Alert sweep failed.");
  }
}
