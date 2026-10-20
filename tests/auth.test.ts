import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { decodeSession, encodeSession, readCookie, SESSION_COOKIE } from "@/lib/auth/session";
import { verifyWalletSignature } from "@/lib/auth/verify";
import { buildSignInMessage } from "@/lib/auth/message";
import { POST as noncePOST } from "@/app/api/auth/nonce/route";
import { POST as verifyPOST } from "@/app/api/auth/verify/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";

const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);

function req(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("session cookie", () => {
  const p = { w: wallet, t: 2 as const, b: 1_500_000, c: Date.now(), iat: Date.now(), exp: Date.now() + 60_000 };

  it("round-trips", () => {
    expect(decodeSession(encodeSession(p))).toEqual(p);
  });
  it("rejects tampering", () => {
    const tok = encodeSession(p);
    const [body, mac] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ ...p, t: 3 })).toString("base64url");
    expect(decodeSession(`${forged}.${mac}`)).toBeNull();
    expect(decodeSession(`${body}.x${mac.slice(1)}`)).toBeNull();
    expect(decodeSession("garbage")).toBeNull();
  });
  it("rejects expired sessions", () => {
    expect(decodeSession(encodeSession({ ...p, exp: Date.now() - 1 }))).toBeNull();
  });
});

describe("signature verification", () => {
  const message = buildSignInMessage({ wallet, nonce: "a".repeat(32), issuedAt: new Date().toISOString(), domain: "localhost" });
  const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));

  it("accepts a valid signature", () => {
    expect(verifyWalletSignature(message, sig, wallet)).toBe(true);
  });
  it("rejects a different message, wallet or malformed signature", () => {
    expect(verifyWalletSignature(message + "x", sig, wallet)).toBe(false);
    expect(verifyWalletSignature(message, sig, bs58.encode(nacl.sign.keyPair().publicKey))).toBe(false);
    expect(verifyWalletSignature(message, "notbase58!!", wallet)).toBe(false);
  });
  it("message is plain text and states it is not a transaction", () => {
    expect(message).toContain("NOT a transaction");
    expect(message).toContain(`Wallet: ${wallet}`);
    expect(message).toMatch(/Nonce: a{32}/);
  });
});

describe("nonce -> sign -> verify flow (route handlers, in-memory store)", () => {
  it("issues a session cookie for a valid signature and rejects replay", async () => {
    const nres = await noncePOST(req("/api/auth/nonce", { wallet }));
    expect(nres.status).toBe(200);
    const { nonce, message } = await nres.json();
    expect(message).toContain(nonce);

    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
    const vres = await verifyPOST(req("/api/auth/verify", { wallet, nonce, signature }));
    expect(vres.status).toBe(200);
    const setCookie = vres.headers.get("set-cookie")!;
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    const body = await vres.json();
    expect(body.session.wallet).toBe(wallet);
    expect(body.session.tier).toBe(0); // token not launched -> free tier

    // Replay with the same nonce fails.
    const replay = await verifyPOST(req("/api/auth/verify", { wallet, nonce, signature }));
    expect(replay.status).toBe(401);

    // Session endpoint recognises the cookie.
    const cookieVal = setCookie.split(";")[0];
    const sres = await sessionGET(req("/api/auth/session", undefined, { cookie: cookieVal }));
    const s = await sres.json();
    expect(s.session.wallet).toBe(wallet);
    expect(readCookie(new Request("http://x", { headers: { cookie: `a=1; ${cookieVal}` } }), SESSION_COOKIE)).toBe(cookieVal.split("=")[1]);
  });

  it("rejects a signature from another key", async () => {
    const { nonce, message } = await (await noncePOST(req("/api/auth/nonce", { wallet }))).json();
    const other = nacl.sign.keyPair();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), other.secretKey));
    const vres = await verifyPOST(req("/api/auth/verify", { wallet, nonce, signature }));
    expect(vres.status).toBe(401);
  });

  it("rejects cross-origin requests", async () => {
    const res = await noncePOST(req("/api/auth/nonce", { wallet }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
});
