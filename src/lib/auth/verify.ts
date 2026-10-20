import nacl from "tweetnacl";
import bs58 from "bs58";

/** Verifies an ed25519 signature over a UTF-8 message for a base58 wallet address. */
export function verifyWalletSignature(message: string, signatureB58: string, walletB58: string): boolean {
  try {
    const sig = bs58.decode(signatureB58);
    const pub = bs58.decode(walletB58);
    if (sig.length !== 64 || pub.length !== 32) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pub);
  } catch {
    return false;
  }
}
