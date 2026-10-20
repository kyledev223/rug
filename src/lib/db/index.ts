import "server-only";
import { serverEnv } from "@/lib/env";
import type { Repo } from "./types";
import { createNeonRepo } from "./neon";
import { createMemoryRepo } from "./memory";

const g = globalThis as unknown as { __rugRepo?: Repo };

/** Neon Postgres when DATABASE_URL is set, otherwise an in-memory store (dev only). */
export function repo(): Repo {
  if (g.__rugRepo) return g.__rugRepo;
  const env = serverEnv();
  if (env.DATABASE_URL) {
    g.__rugRepo = createNeonRepo(env.DATABASE_URL);
  } else {
    console.warn(
      "[db] DATABASE_URL not set — using in-memory storage. " +
        "Data is lost on restart and not shared across serverless instances.",
    );
    g.__rugRepo = createMemoryRepo();
  }
  return g.__rugRepo;
}

export type * from "./types";
