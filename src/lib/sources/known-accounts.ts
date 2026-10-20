/**
 * Accounts we can label with confidence. Only add entries you have verified:
 * anything marked "pool" or "burn" is excluded from whale/concentration metrics.
 */
import type { HolderKind } from "@/lib/scan/types";

export const KNOWN_OWNERS: Record<string, { kind: HolderKind; label: string }> = {
  "1nc1nerator11111111111111111111111111111111": { kind: "burn", label: "Incinerator (burn)" },
  "11111111111111111111111111111111": { kind: "burn", label: "System Program (unspendable)" },
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": { kind: "pool", label: "Raydium AMM v4 authority" },
  GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL: { kind: "pool", label: "Raydium CPMM authority" },
};

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
