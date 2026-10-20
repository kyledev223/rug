import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/scan/catalog";
import { runChecks } from "@/lib/scan/engine";
import { renderWordmark } from "@/components/AsciiLogo";
import { badSnapshot, goodSnapshot } from "./fixtures/snapshots";

describe("docs catalog", () => {
  it("matches engine ids, weights, categories and heuristic flags", () => {
    for (const snap of [goodSnapshot(), badSnapshot()]) {
      const checks = runChecks(snap);
      expect(checks.map((c) => c.id)).toEqual(CATALOG.map((c) => c.id));
      for (const c of checks) {
        const entry = CATALOG.find((e) => e.id === c.id)!;
        expect(entry.weight, c.id).toBe(c.weight);
        expect(entry.category, c.id).toBe(c.category);
        expect(Boolean(entry.heuristic), c.id).toBe(Boolean(c.heuristic));
      }
    }
  });
});

describe("ascii wordmark", () => {
  it("renders five equal-width ASCII rows", () => {
    const lines = renderWordmark("RUG CHECK");
    expect(lines).toHaveLength(5);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    expect(lines.join("")).toMatch(/^[#.]+$/);
    // "R" top row then gap column
    expect(lines[0].startsWith("##..")).toBe(true);
  });
});
