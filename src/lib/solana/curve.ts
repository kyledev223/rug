import { PublicKey } from "@solana/web3.js";

/** On-curve keys can sign (regular wallets); off-curve keys are PDAs owned by programs. */
export function isOnCurve(address: string): boolean {
  try {
    return PublicKey.isOnCurve(new PublicKey(address).toBytes());
  } catch {
    return false;
  }
}
