import { describe, expect, it } from "vitest";
import { isValidPublicKey, parseMintList } from "@/lib/solana/address";
import { buildAiInput, violatesPolicy } from "@/lib/ai/gemini";
import { buildReport } from "@/lib/scan/engine";
import { badSnapshot } from "./fixtures/snapshots";

describe("mint validation", () => {
  it("accepts 32-byte base58 keys", () => {
    expect(isValidPublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263")).toBe(true);
    expect(isValidPublicKey("11111111111111111111111111111111")).toBe(true);
  });
  it("rejects garbage", () => {
    for (const bad of ["", "0x1234", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB26O", "abc", "I".repeat(44), 42, null]) {
      expect(isValidPublicKey(bad)).toBe(false);
    }
  });
  it("parses bulk lists", () => {
    const r = parseMintList("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263, nope\nDezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
    expect(r.valid).toHaveLength(1);
    expect(r.invalid).toEqual(["nope"]);
  });
});

describe("AI guardrails", () => {
  it("rejects safety claims and trading advice", () => {
    expect(violatesPolicy("This token looks safe overall.", "LOW")).not.toBeNull();
    expect(violatesPolicy("You should buy before it pumps.", "LOW")).not.toBeNull();
    expect(violatesPolicy("It is not a rug.", "LOW")).not.toBeNull();
  });
  it("rejects contradicting the label", () => {
    expect(violatesPolicy("Overall this is LOW risk.", "CRITICAL")).not.toBeNull();
    expect(violatesPolicy("Overall this is CRITICAL risk.", "CRITICAL")).toBeNull();
  });
  it("allows normal explanations", () => {
    expect(
      violatesPolicy("Someone can still mint new tokens. A low score does not mean a token is safe.", "LOW"),
    ).toBeNull();
  });
  it("sends only structured check results to the model", () => {
    const input = buildAiInput(buildReport(badSnapshot()));
    expect(Object.keys(input).sort()).toEqual(["checks", "dataCoveragePercent", "riskLabel", "riskScore", "scoreMeaning", "token"]);
    for (const c of input.checks) {
      expect(Object.keys(c).sort()).toEqual(["evidence", "finding", "heuristic", "id", "status", "title"]);
      expect(c.evidence.length).toBeLessThanOrEqual(6);
    }
  });
});
