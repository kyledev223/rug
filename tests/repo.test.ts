import { describe } from "vitest";
import { createMemoryRepo } from "@/lib/db/memory";
import { repoContract } from "./repo-contract";

describe("in-memory repo contract", () => {
  repoContract(() => createMemoryRepo());
});
