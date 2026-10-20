"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import type { SessionInfo } from "@/lib/auth/info";

interface SessionCtx {
  session: SessionInfo | null;
  loading: boolean;
  verifying: boolean;
  error: string | null;
  /** Connected wallet differs from the verified one (or none verified yet). */
  needsVerify: boolean;
  verify: () => Promise<void>;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json as T;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected } = useWallet();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const json = await res.json();
      setSession(json.session ?? null);
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const verify = useCallback(async () => {
    setError(null);
    if (!publicKey) return setError("Connect a wallet first.");
    if (!signMessage) return setError("This wallet can't sign messages. Try Phantom, Solflare or Backpack.");
    setVerifying(true);
    try {
      const wallet = publicKey.toBase58();
      const { nonce, message } = await post<{ nonce: string; message: string }>("/api/auth/nonce", { wallet });
      const sig = await signMessage(new TextEncoder().encode(message));
      const { session } = await post<{ session: SessionInfo }>("/api/auth/verify", { wallet, nonce, signature: bs58.encode(sig) });
      setSession(session);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/reject|denied|cancel/i.test(msg) ? "Signature request was cancelled." : msg);
    } finally {
      setVerifying(false);
    }
  }, [publicKey, signMessage]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { session } = await post<{ session: SessionInfo }>("/api/auth/refresh");
      setSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const logout = useCallback(async () => {
    await post("/api/auth/logout").catch(() => {});
    await reload();
  }, [reload]);

  const connectedKey = connected && publicKey ? publicKey.toBase58() : null;
  const needsVerify = Boolean(connectedKey && session?.wallet !== connectedKey);

  const value = useMemo<SessionCtx>(
    () => ({ session, loading, verifying, error, needsVerify, verify, refresh, reload, logout, clearError: () => setError(null) }),
    [session, loading, verifying, error, needsVerify, verify, refresh, reload, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const noop = async () => {};
/** Used when a segment renders without the root providers (e.g. Next's instant-navigation validation). */
const FALLBACK: SessionCtx = {
  session: null,
  loading: true,
  verifying: false,
  error: null,
  needsVerify: false,
  verify: noop,
  refresh: noop,
  reload: noop,
  logout: noop,
  clearError: () => {},
};

export function useSession(): SessionCtx {
  return useContext(Ctx) ?? FALLBACK;
}
