import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** IPs are never stored raw. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${serverEnv().IP_HASH_SALT}:${ip}`).digest("hex").slice(0, 32);
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers?: HeadersInit) {
  return Response.json({ error: { code, message, ...extra } }, { status, headers });
}

/** Parses a JSON body with a size cap. Returns null on invalid JSON. */
export async function readJson<T = unknown>(req: Request, maxBytes = 16_384): Promise<T | null> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Rejects cross-site browser POSTs to cookie-authenticated routes. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  try {
    return new URL(origin).host === new URL(req.url).host || origin === process.env.NEXT_PUBLIC_SITE_URL;
  } catch {
    return false;
  }
}
