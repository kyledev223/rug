import type { CheckResult, CheckStatus, Evidence } from "../types";
import type { TokenSnapshot } from "../snapshot";
import { check, ev, unavailable, worst } from "./util";

const BASE = { id: "token2022_extensions", title: "Token-2022 extensions", category: "token2022", weight: 15 } as const;

/** Extensions that only describe the token and carry no holder risk. */
const BENIGN = new Set([
  "metadataPointer",
  "tokenMetadata",
  "groupPointer",
  "tokenGroup",
  "groupMemberPointer",
  "tokenGroupMember",
  "immutableOwner",
  "memoTransfer",
  "cpiGuard",
]);

interface Finding {
  status: CheckStatus;
  text: string;
  account?: string;
  critical?: boolean;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function assessExtension(name: string, state: Record<string, unknown> = {}): Finding {
  switch (name) {
    case "permanentDelegate": {
      const d = str(state.delegate);
      return d
        ? { status: "fail", text: "Permanent delegate can transfer or burn tokens from ANY holder", account: d, critical: true }
        : { status: "pass", text: "Permanent delegate extension present but unset" };
    }
    case "transferHook": {
      const program = str(state.programId);
      const auth = str(state.authority);
      if (program)
        return { status: "fail", text: "Transfer hook runs custom code on every transfer (can block sells)", account: program, critical: true };
      if (auth) return { status: "warn", text: "Transfer hook not set, but its authority can enable one later", account: auth };
      return { status: "pass", text: "Transfer hook extension present but disabled" };
    }
    case "transferFeeConfig": {
      const newer = (state.newerTransferFee ?? {}) as Record<string, unknown>;
      const older = (state.olderTransferFee ?? {}) as Record<string, unknown>;
      const bps = Math.max(Number(newer.transferFeeBasisPoints ?? 0), Number(older.transferFeeBasisPoints ?? 0));
      const auth = str(state.transferFeeConfigAuthority);
      if (bps >= 500) return { status: "fail", text: `Transfer fee of ${(bps / 100).toFixed(2)}% on every transfer`, account: auth ?? undefined };
      if (bps > 0) return { status: "warn", text: `Transfer fee of ${(bps / 100).toFixed(2)}% on every transfer`, account: auth ?? undefined };
      if (auth) return { status: "warn", text: "Transfer fee is 0% but its authority can raise it", account: auth };
      return { status: "pass", text: "Transfer fee is 0% and fixed" };
    }
    case "defaultAccountState": {
      const st = str(state.accountState);
      return st === "frozen"
        ? { status: "fail", text: "New token accounts start FROZEN by default", critical: true }
        : { status: "pass", text: `Default account state: ${st ?? "initialized"}` };
    }
    case "nonTransferable":
      return { status: "fail", text: "Token is non-transferable (cannot be sold)", critical: true };
    case "pausableConfig": {
      const auth = str(state.authority);
      if (state.paused === true) return { status: "fail", text: "Token transfers are currently PAUSED", critical: true, account: auth ?? undefined };
      return auth
        ? { status: "fail", text: "Pause authority can halt all transfers", account: auth, critical: true }
        : { status: "pass", text: "Pausable extension present without an authority" };
    }
    case "mintCloseAuthority": {
      const auth = str(state.closeAuthority);
      return auth
        ? { status: "warn", text: "Mint close authority exists (mint can be closed and re-created)", account: auth }
        : { status: "pass", text: "Mint close authority unset" };
    }
    case "interestBearingConfig":
    case "scaledUiAmountConfig": {
      const auth = str(state.rateAuthority) ?? str(state.authority);
      return {
        status: "warn",
        text: "Displayed balances are scaled by an adjustable rate/multiplier",
        account: auth ?? undefined,
      };
    }
    case "confidentialTransferMint":
    case "confidentialTransferFeeConfig":
    case "confidentialMintBurn":
      return { status: "warn", text: "Confidential transfers enabled (balances/amounts can be hidden)" };
    default:
      if (BENIGN.has(name)) return { status: "pass", text: "Informational extension" };
      return { status: "warn", text: "Unrecognized extension — review manually" };
  }
}

export function token2022Check(s: TokenSnapshot): CheckResult {
  const f = s.mintInfo;
  if (!f.ok) return unavailable(BASE, f, "Mint account");
  if (f.data.program === "spl-token") {
    return check(BASE, "pass", "Classic SPL Token program — no Token-2022 extensions", [
      ev(f, "Token program", "SPL Token (classic)"),
    ]);
  }
  const exts = f.data.extensions;
  if (exts.length === 0) {
    return check(BASE, "pass", "Token-2022 mint with no extensions", [ev(f, "Extensions", "none")]);
  }
  const evidence: Evidence[] = [];
  const statuses: CheckStatus[] = [];
  let critical = false;
  const flagged: string[] = [];
  for (const e of exts) {
    const a = assessExtension(e.extension, e.state);
    statuses.push(a.status);
    if (a.critical && a.status === "fail") critical = true;
    if (a.status !== "pass") flagged.push(e.extension);
    evidence.push(ev(f, e.extension, `${a.status.toUpperCase()} — ${a.text}`, a.account ? { account: a.account } : {}));
  }
  const status = worst(statuses);
  const summary =
    flagged.length === 0
      ? `Token-2022 with ${exts.length} informational extension(s), none risky`
      : `Risky Token-2022 extension(s): ${flagged.join(", ")}`;
  return check(BASE, status, summary, evidence, critical ? 75 : undefined);
}
