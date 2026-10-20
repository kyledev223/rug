import "server-only";
import { serverEnv } from "@/lib/env";
import type { Repo } from "./types";
import { createSupabaseRepo } from "./supabase";
import { createMemoryRepo } from "./memory";

const g = globalThis as unknown as { __rugRepo?: Repo };

/** Supabase when configured, otherwise an in-memory store (dev only). */
export function repo(): Repo {
  if (g.__rugRepo) return g.__rugRepo;
  const env = serverEnv();
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    g.__rugRepo = createSupabaseRepo(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    console.warn(
      "[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — using in-memory storage. " +
        "Data is lost on restart and not shared across serverless instances.",
    );
    g.__rugRepo = createMemoryRepo();
  }
  return g.__rugRepo;
}

export type * from "./types";
