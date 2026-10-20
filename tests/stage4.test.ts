import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // Gated routes are exercised as a tier 3 wallet (dev-only override, ignored in production).
  process.env.DEV_FORCE_TIER = "3";
});

import nacl from "tweetnacl";
import bs58 from "bs58";
import { diffSnapshots, isAllowedWebhook, toWatchSnapshot } from "@/lib/alerts/diff";
import { csvCell, toCsv } from "@/lib/csv";
import { buildReport } from "@/lib/scan/engine";
import type { WatchSnapshot } from "@/lib/db/types";
import { badSnapshot, goodSnapshot } from "./fixtures/snapshots";
import { POST as noncePOST } from "@/app/api/auth/nonce/route";
import { POST as verifyPOST } from "@/app/api/auth/verify/route";
import { GET as listsGET, POST as listsPOST } from "@/app/api/watchlists/route";
import { PATCH as listPATCH } from "@/app/api/watchlists/[id]/route";
import { GET as keysGET, POST as keysPOST, DELETE as keysDELETE } from "@/app/api/keys/route";
import { GET as v1GET } from "@/app/api/v1/scan/route";
import { GET as cronGET } from "@/app/api/cron/alerts/route";

const settings = { alert_score_change: true, alert_authority: true, alert_liquidity_drop_pct: 30, alert_holder_dump_pct: 5 };
const base: WatchSnapshot = {
  score: 20,
  label: "LOW",
  liquidityUsd: 100_000,
  mintAuthority: false,
  freezeAuthority: false,
  topHolders: [
    { owner: "A1", pct: 12 },
    { owner: "B2", pct: 6 },
    { owner: "C3", pct: 3 },
  ],
  generatedAt: "2026-10-01T00:00:00Z",
};

describe("alert diffing", () => {
  it("is quiet when nothing meaningful changed", () => {
    expect(diffSnapshots(base, { ...base, score: 25, liquidityUsd: 90_000 }, settings, "$T")).toEqual([]);
  });
  it("flags a liquidity pull", () => {
    const a = diffSnapshots(base, { ...base, liquidityUsd: 20_000 }, settings, "$T");
    expect(a.map((x) => x.kind)).toEqual(["liquidity_drop"]);
    expect(a[0].message).toContain("80%");
  });
  it("flags risk label changes and authority changes", () => {
    const a = diffSnapshots(base, { ...base, score: 55, label: "HIGH", freezeAuthority: true }, settings, "$T");
    expect(a.map((x) => x.kind).sort()).toEqual(["authority", "risk_change"]);
  });
  it("flags a holder dumping, including leaving the visible list", () => {
    const a = diffSnapshots(base, { ...base, topHolders: [{ owner: "B2", pct: 6 }, { owner: "C3", pct: 3 }] }, settings, "$T");
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("holder_dump");
    expect(a[0].details.owner).toBe("A1");
  });
  it("respects disabled settings and unknown data", () => {
    const off = { alert_score_change: false, alert_authority: false, alert_liquidity_drop_pct: 0, alert_holder_dump_pct: 0 };
    expect(diffSnapshots(base, { ...base, score: 90, label: "CRITICAL", liquidityUsd: 1 }, off, "$T")).toEqual([]);
    expect(diffSnapshots(base, { ...base, mintAuthority: null, topHolders: null }, settings, "$T")).toEqual([]);
  });
  it("builds snapshots from reports", () => {
    const s = toWatchSnapshot(buildReport(badSnapshot()));
    expect(s.mintAuthority).toBe(true);
    expect(s.topHolders?.[0].pct).toBe(40);
    expect(toWatchSnapshot(buildReport(goodSnapshot())).topHolders?.every((h) => h.pct <= 2)).toBe(true);
  });
});

describe("csv + webhook safety", () => {
  it("neutralizes spreadsheet formulas and quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"');
  });
  it("only allows Discord webhooks", () => {
    expect(isAllowedWebhook("https://discord.com/api/webhooks/123/abc-DEF_1")).toBe(true);
    expect(isAllowedWebhook("http://discord.com/api/webhooks/123/abc")).toBe(false);
    expect(isAllowedWebhook("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedWebhook("https://discord.com.evil.example/api/webhooks/1/a")).toBe(false);
  });
});

function req(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(): Promise<string> {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const { nonce, message } = await (await noncePOST(req("/api/auth/nonce", "POST", { wallet }))).json();
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  const res = await verifyPOST(req("/api/auth/verify", "POST", { wallet, nonce, signature }));
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("gated routes", () => {
  it("rejects anonymous access", async () => {
    expect((await listsGET(req("/api/watchlists"))).status).toBe(401);
    expect((await keysGET(req("/api/keys"))).status).toBe(401);
  });

  it("watchlists: create, list, validate webhook", async () => {
    const cookie = await login();
    const created = await listsPOST(req("/api/watchlists", "POST", { name: "degen picks" }, { cookie }));
    expect(created.status).toBe(201);
    const { list } = await created.json();
    const all = await (await listsGET(req("/api/watchlists", "GET", undefined, { cookie }))).json();
    expect(all.lists.map((l: { name: string }) => l.name)).toEqual(["degen picks"]);
    expect(all.limits).toMatchObject({ watchlists: 5, alerts: true });

    const ctx = { params: Promise.resolve({ id: list.id }) };
    const bad = await listPATCH(req(`/api/watchlists/${list.id}`, "PATCH", { webhook_url: "https://evil.example/hook" }, { cookie }), ctx);
    expect(bad.status).toBe(400);
    const ok = await listPATCH(req(`/api/watchlists/${list.id}`, "PATCH", { alert_liquidity_drop_pct: 50 }, { cookie }), ctx);
    expect(ok.status).toBe(200);
  });

  it("api keys: create once, authenticate, revoke", async () => {
    const cookie = await login();
    const created = await keysPOST(req("/api/keys", "POST", { name: "bot" }, { cookie }));
    expect(created.status).toBe(201);
    const { key, apiKey } = await created.json();
    expect(key).toMatch(/^rc_live_/);
    const listed = await (await keysGET(req("/api/keys", "GET", undefined, { cookie }))).json();
    expect(JSON.stringify(listed)).not.toContain(key); // plaintext is never returned again

    expect((await v1GET(req("/api/v1/scan?mint=bad"))).status).toBe(401);
    const authed = await v1GET(req("/api/v1/scan?mint=bad", "GET", undefined, { authorization: `Bearer ${key}` }));
    expect(authed.status).toBe(400); // key accepted, mint rejected before any network call

    await keysDELETE(req(`/api/keys?id=${apiKey.id}`, "DELETE", undefined, { cookie }));
    const revoked = await v1GET(req("/api/v1/scan?mint=bad", "GET", undefined, { authorization: `Bearer ${key}` }));
    expect(revoked.status).toBe(401);
  });

  it("cron route requires the secret", async () => {
    expect((await cronGET(req("/api/cron/alerts"))).status).toBe(401);
  });
});
