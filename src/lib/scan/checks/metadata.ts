import type { CheckResult } from "../types";
import type { TokenSnapshot } from "../snapshot";
import { check, ev, unavailable } from "./util";

const MUTABLE = { id: "metadata_mutable", title: "Metadata mutability", category: "metadata", weight: 4 } as const;
const SOCIALS = { id: "socials", title: "Website & socials", category: "metadata", weight: 2 } as const;

export function mutabilityCheck(s: TokenSnapshot): CheckResult {
  const f = s.metadata;
  if (!f.ok) return unavailable(MUTABLE, f, "Metadata");
  const { mutable, updateAuthority } = f.data;
  if (mutable === null) return check(MUTABLE, "unknown", "Could not determine if metadata is mutable", [ev(f, "Mutable", "unknown")]);
  if (mutable) {
    return check(MUTABLE, "warn", "Metadata is mutable — name, symbol or image can be changed", [
      ev(f, "Mutable", "yes"),
      ...(updateAuthority ? [ev(f, "Update authority", updateAuthority, { account: updateAuthority })] : []),
    ]);
  }
  return check(MUTABLE, "pass", "Metadata is immutable", [ev(f, "Mutable", "no")]);
}

export function socialsCheck(s: TokenSnapshot): CheckResult {
  const f = s.metadata;
  if (!f.ok) return unavailable(SOCIALS, f, "Metadata");
  const { website, twitter, telegram, other } = f.data.socials;
  const found = [
    website && ["Website", website],
    twitter && ["X / Twitter", twitter],
    telegram && ["Telegram", telegram],
    ...other.map((o) => ["Other", o]),
  ].filter(Boolean) as Array<[string, string]>;
  const src = { source: f.data.socialsSource, at: f.at };
  if (found.length === 0) return check(SOCIALS, "warn", "No website or social links found", [ev(src, "Links", "none")]);
  return check(
    SOCIALS,
    "pass",
    `${found.length} link(s) found (presence only — not verified as official)`,
    found.map(([k, v]) => ev(src, k, v)),
  );
}
