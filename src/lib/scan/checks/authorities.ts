import type { CheckResult } from "../types";
import type { TokenSnapshot } from "../snapshot";
import { check, ev, unavailable } from "./util";

const MINT = { id: "mint_authority", title: "Mint authority", category: "authorities", weight: 20 } as const;
const FREEZE = { id: "freeze_authority", title: "Freeze authority", category: "authorities", weight: 15 } as const;

export function mintAuthorityCheck(s: TokenSnapshot): CheckResult {
  const f = s.mintInfo;
  if (!f.ok) return unavailable(MINT, f, "Mint account");
  const auth = f.data.mintAuthority;
  if (auth) {
    return check(
      MINT,
      "fail",
      "Mint authority is still active — new tokens can be created at any time",
      [ev(f, "Mint authority", auth, { account: auth })],
      50,
    );
  }
  return check(MINT, "pass", "Mint authority is revoked — supply is fixed", [ev(f, "Mint authority", "none (revoked)")]);
}

export function freezeAuthorityCheck(s: TokenSnapshot): CheckResult {
  const f = s.mintInfo;
  if (!f.ok) return unavailable(FREEZE, f, "Mint account");
  const auth = f.data.freezeAuthority;
  if (auth) {
    return check(
      FREEZE,
      "fail",
      "Freeze authority is still active — holder accounts can be frozen (blocking sells)",
      [ev(f, "Freeze authority", auth, { account: auth })],
      50,
    );
  }
  return check(FREEZE, "pass", "Freeze authority is revoked", [ev(f, "Freeze authority", "none (revoked)")]);
}
