"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidPublicKey } from "@/lib/solana/address";
import { cx } from "./ui";

export function ScanForm({ autoFocus = false, size = "lg" }: { autoFocus?: boolean; size?: "lg" | "sm" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return setError("Paste a token mint address first.");
    if (!isValidPublicKey(v)) return setError("That doesn't look like a Solana address (base58, 32–44 characters).");
    setError(null);
    router.push(`/scan/${v}`);
  }

  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <label htmlFor={`mint-${size}`} className="sr-only">
        Solana token mint address
      </label>
      <div
        className={cx(
          "flex w-full flex-col gap-2 rounded-[4px] border bg-paper p-2 transition-colors sm:flex-row sm:items-center",
          error ? "border-red" : focused ? "border-ink" : "border-line-2",
        )}
      >
        <div className="relative flex min-w-0 flex-1 items-center gap-2 px-2">
          <span aria-hidden className="shrink-0 font-bold text-red">
            &gt;_
          </span>
          <input
            id={`mint-${size}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
            placeholder="paste token mint address"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `mint-err-${size}` : undefined}
            className={cx(
              "w-full min-w-0 bg-transparent font-mono text-ink caret-red outline-none placeholder:text-faint",
              size === "lg" ? "py-2 text-sm sm:text-base" : "py-1 text-sm",
            )}
          />
          {!value && !focused && (
            <span aria-hidden className="pointer-events-none absolute left-9 animate-blink text-red motion-reduce:animate-none">
              █
            </span>
          )}
        </div>
        <button
          type="submit"
          className={cx(
            "shrink-0 rounded-[3px] bg-red px-4 font-mono font-bold text-white transition-colors hover:bg-red-dark",
            size === "lg" ? "py-2.5 text-sm" : "py-1.5 text-xs",
          )}
        >
          &gt;_ scan
        </button>
      </div>
      {error && (
        <p id={`mint-err-${size}`} role="alert" className="mt-2 text-xs font-bold text-red-dark">
          {error}
        </p>
      )}
    </form>
  );
}
