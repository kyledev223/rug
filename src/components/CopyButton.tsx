"use client";

import { useState } from "react";
import { btn } from "./ui";

export function CopyButton({ value, label = "copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className ?? btn.small}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked */
        }
      }}
      aria-label={`${label}: ${value}`}
    >
      {done ? "copied ✓" : label}
    </button>
  );
}
