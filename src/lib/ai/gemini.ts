import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import type { Explanation, ScanReport } from "@/lib/scan/types";
import { APP_NAME } from "@/lib/config";

export const SYSTEM_PROMPT = `You are the explanation layer of ${APP_NAME}, an automated Solana token risk scanner.
You receive the structured results of deterministic, rules-based checks. Your only job is to explain them
in plain English to a beginner who has never used a blockchain explorer.

Hard rules:
- Never say or imply a token is "safe", "legit", "trustworthy", "a good investment" or "risk-free".
  A low score only means fewer automated signals were found.
- Never give buy, sell, hold or any trading/financial advice. Do not predict prices.
- Never contradict the rules-based score, label, or any check status. Do not re-score anything.
- Only use facts present in the input. Do not invent numbers, accounts, or events.
- Checks marked heuristic are pattern-based guesses; say so when you explain them.
- "unknown" means the data could not be fetched; say it was not verified, never that it passed.
- Keep each check explanation to 1-2 short sentences. Keep the overview under 90 words.
- No markdown, no emojis.`;

const OutputSchema = z.object({
  overview: z.string().min(10).max(1200),
  checks: z.array(z.object({ id: z.string(), explanation: z.string().min(3).max(600) })).max(30),
});

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, explanation: { type: "string" } },
        required: ["id", "explanation"],
      },
    },
  },
  required: ["overview", "checks"],
};

/** Only structured check results go to the model — no raw RPC payloads. */
export function buildAiInput(r: ScanReport) {
  return {
    token: { name: r.token.name, symbol: r.token.symbol },
    riskScore: r.score,
    riskLabel: r.label,
    scoreMeaning: "0-100, higher = more risk. LOW <25, MEDIUM 25-49, HIGH 50-74, CRITICAL 75+.",
    dataCoveragePercent: r.coverage,
    checks: r.checks.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      heuristic: Boolean(c.heuristic),
      finding: c.summary,
      evidence: c.evidence.slice(0, 6).map((e) => `${e.label}: ${e.value}`.slice(0, 160)),
    })),
  };
}

const BANNED: RegExp[] = [
  /\b(is|are|looks|seems|appears|totally|completely|probably|likely)\s+(safe|legit(imate)?|trustworthy|risk[- ]free)\b/i,
  /\bsafe (to|investment|bet|buy)\b/i,
  /\b(you should|we recommend|i recommend|consider|good time to|go ahead and)\s+(buy|sell|hold|ape|invest)/i,
  /\b(buy|sell) (now|signal)\b/i,
  /\bnot a (rug|scam)\b/i,
];

/** Rejects AI output that breaks the rules; the caller falls back to templates. */
export function violatesPolicy(text: string, label: ScanReport["label"]): string | null {
  for (const re of BANNED) {
    const g = new RegExp(re.source, "gi");
    for (const m of text.matchAll(g)) {
      // Allow negated forms such as "does not mean a token is safe".
      const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index).toLowerCase();
      if (/\b(not|never|no|n't|cannot)\b[^.]*$/.test(before) && !/^not a (rug|scam)/i.test(m[0])) continue;
      return `matched ${re}`;
    }
  }
  const labels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].filter((l) => l !== label);
  for (const l of labels) if (new RegExp(`\\b${l}\\b(?=\\s*(risk|\\(|label|score))`).test(text)) return `mentions label ${l}`;
  return null;
}

export function geminiConfigured(): boolean {
  return Boolean(serverEnv().GEMINI_API_KEY);
}

export async function aiExplanation(r: ScanReport): Promise<Explanation | null> {
  const env = serverEnv();
  if (!env.GEMINI_API_KEY) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: JSON.stringify(buildAiInput(r)) }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(20_000),
      },
    });
    const text = res.text;
    if (!text) throw new Error("empty response");
    const parsed = OutputSchema.parse(JSON.parse(text));
    const ids = new Set(r.checks.map((c) => c.id));
    const checks: Record<string, string> = {};
    for (const c of parsed.checks) if (ids.has(c.id)) checks[c.id] = c.explanation.trim();
    const all = [parsed.overview, ...Object.values(checks)].join("\n");
    const violation = violatesPolicy(all, r.label);
    if (violation) {
      logError("gemini", new Error(`policy guard rejected output: ${violation}`));
      return null;
    }
    return { source: "ai", model: env.GEMINI_MODEL, overview: parsed.overview.trim(), checks, generatedAt: new Date().toISOString() };
  } catch (e) {
    logError("gemini", e);
    return null;
  }
}
