import { describe, expect, it } from "vitest";
import { findFunder } from "@/lib/scan/collect";
import type { ParsedTransaction } from "@/lib/sources/rpc";

const SYS = "11111111111111111111111111111111";
const owner = "5yiGAF4CjscmQkUU3qz97BwXHQgvuirNuM39T4BeLF1R";
const funder = "99mRw3EzdJZWEUjgp1nrU4WeHsukUBjbh7gYE7pm4F3c";

function tx(instructions: ParsedTransaction["transaction"]["message"]["instructions"], inner: typeof instructions = []): ParsedTransaction {
  return {
    blockTime: 1_700_000_000,
    slot: 1,
    transaction: { signatures: ["s"], message: { accountKeys: [], instructions } },
    meta: { err: null, innerInstructions: inner.length ? [{ index: 0, instructions: inner }] : [] },
  };
}

describe("findFunder (shape taken from a real jsonParsed system transfer)", () => {
  it("finds a top-level SOL transfer into the wallet", () => {
    const t = tx([{ program: "system", programId: SYS, parsed: { type: "transfer", info: { source: funder, destination: owner, lamports: 1 } } }]);
    expect(findFunder(t, owner)).toBe(funder);
  });
  it("finds transfers inside inner instructions", () => {
    const t = tx([], [{ program: "system", programId: SYS, parsed: { type: "transfer", info: { source: funder, destination: owner, lamports: 1 } } }]);
    expect(findFunder(t, owner)).toBe(funder);
  });
  it("finds createAccount funding", () => {
    const t = tx([{ programId: SYS, parsed: { type: "createAccount", info: { source: funder, newAccount: owner } } }]);
    expect(findFunder(t, owner)).toBe(funder);
  });
  it("ignores outgoing transfers and other programs", () => {
    const t = tx([
      { programId: SYS, parsed: { type: "transfer", info: { source: owner, destination: funder } } },
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", parsed: { type: "transfer", info: { source: funder, destination: owner } } },
    ]);
    expect(findFunder(t, owner)).toBeNull();
  });
});
