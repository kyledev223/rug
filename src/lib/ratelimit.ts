import "server-only";
import { repo } from "@/lib/db";
import { logError } from "@/lib/log";

export interface LimitResult {
  ok: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

// Last-resort local limiter if the database is unreachable (fail closed-ish, per instance).
const local = new Map<string, { n: number; exp: number }>();
function localIncr(key: string, exp: number): number {
  const now = Date.now();
  if (local.size > 10_000) for (const [k, v] of local) if (v.exp < now) local.delete(k);
  const v = local.get(key);
  if (!v || v.exp < now) {
    local.set(key, { n: 1, exp });
    return 1;
  }
  return ++v.n;
}

async function incr(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  const resetAt = new Date(start + windowMs);
  try {
    const count = await repo().incrCounter(key, new Date(start), resetAt);
    return { count, resetAt };
  } catch (e) {
    logError("ratelimit", e);
    return { count: localIncr(`${key}|${start}`, resetAt.getTime()), resetAt };
  }
}

/** Fixed-window rate limit. Counts this request. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<LimitResult> {
  const { count, resetAt } = await incr(`rl:${key}`, windowSec * 1000);
  return { ok: count <= limit, count, limit, remaining: Math.max(0, limit - count), resetAt };
}

const DAY = 86_400_000;

function dayStart(): Date {
  return new Date(Math.floor(Date.now() / DAY) * DAY);
}

/** Consumes one unit of a daily (UTC) quota. limit=null means unlimited (still counted). */
export async function consumeDaily(subject: string, limit: number | null): Promise<LimitResult> {
  const { count, resetAt } = await incr(`day:${subject}`, DAY);
  const lim = limit ?? Number.POSITIVE_INFINITY;
  return { ok: count <= lim, count, limit: limit ?? -1, remaining: limit === null ? -1 : Math.max(0, limit - count), resetAt };
}

export async function peekDaily(subject: string): Promise<number> {
  try {
    return await repo().getCounter(`day:${subject}`, dayStart());
  } catch (e) {
    logError("ratelimit", e);
    return 0;
  }
}

export function limitHeaders(r: LimitResult): HeadersInit {
  return {
    "x-ratelimit-limit": String(r.limit),
    "x-ratelimit-remaining": String(r.remaining),
    "x-ratelimit-reset": String(Math.ceil(r.resetAt.getTime() / 1000)),
    ...(r.ok ? {} : { "retry-after": String(Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000))) }),
  };
}
