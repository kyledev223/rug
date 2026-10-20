import "server-only";

/** Server-side environment. Never import from client components. */
export interface ServerEnv {
  HELIUS_API_KEY?: string;
  SOLANA_RPC_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SESSION_SECRET: string;
  CRON_SECRET?: string;
  IP_HASH_SALT: string;
  DEV_FORCE_TIER?: number;
  NODE_ENV: string;
}

let cached: ServerEnv | null = null;
let warned = false;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const e = process.env;
  const isProd = e.NODE_ENV === "production";
  const sessionSecret = e.SESSION_SECRET || "";
  if (isProd && sessionSecret.length < 32 && e.NEXT_PHASE !== "phase-production-build") {
    throw new Error("SESSION_SECRET must be set (32+ chars) in production");
  }
  if (!sessionSecret && !warned) {
    warned = true;
    console.warn("[env] SESSION_SECRET not set — using an insecure development secret");
  }
  const forced = e.DEV_FORCE_TIER;
  cached = {
    HELIUS_API_KEY: e.HELIUS_API_KEY || undefined,
    SOLANA_RPC_URL: e.SOLANA_RPC_URL || undefined,
    GEMINI_API_KEY: e.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: e.GEMINI_MODEL || "gemini-3.8-flash",
    SUPABASE_URL: e.SUPABASE_URL || undefined,
    SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY || undefined,
    SESSION_SECRET: sessionSecret || "dev-insecure-session-secret-change-me-0000",
    CRON_SECRET: e.CRON_SECRET || undefined,
    IP_HASH_SALT: e.IP_HASH_SALT || sessionSecret || "dev-salt",
    // Testing aid only: ignored outside `next dev`.
    DEV_FORCE_TIER:
      !isProd && forced && /^[0-3]$/.test(forced) ? Number(forced) : undefined,
    NODE_ENV: e.NODE_ENV || "development",
  };
  return cached;
}
