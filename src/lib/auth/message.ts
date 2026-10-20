import { APP_NAME } from "@/lib/config";

/** The exact plain-text message a wallet signs. No transaction, no approvals. */
export function buildSignInMessage(p: { wallet: string; nonce: string; issuedAt: string; domain: string }): string {
  return [
    `${APP_NAME} wants you to prove you own this wallet.`,
    "",
    `Wallet: ${p.wallet}`,
    `Domain: ${p.domain}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
    "",
    "Signing this message is free. It is NOT a transaction, moves no funds,",
    "and grants no approvals. We will never ask for your seed phrase.",
  ].join("\n");
}
