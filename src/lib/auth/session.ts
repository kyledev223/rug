import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import type { TierId } from "@/lib/config";

export const SESSION_COOKIE = "rc_session";
export const SESSION_TTL_MS = 7 * 24 * 3600_000;

export interface SessionPayload {
  w: string; // wallet
  t: TierId; // tier at last check
  b: number; // balance at last check
  c: number; // last balance check (ms)
  iat: number;
  exp: number;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

function sign(data: string) {
  return createHmac("sha256", serverEnv().SESSION_SECRET).update(data).digest("base64url");
}

export function encodeSession(p: SessionPayload): string {
  const body = b64url(JSON.stringify(p));
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined | null): SessionPayload | null {
  if (!token || token.length > 2048) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof p.w !== "string" || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export function sessionCookie(value: string, maxAgeMs = SESSION_TTL_MS): string {
  const secure = serverEnv().NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
