import "server-only";
import { tierById, type TierDef } from "@/lib/config";
import { clientIp, hashIp } from "@/lib/http";

export interface Viewer {
  ip: string;
  ipHash: string;
  wallet: string | null;
  tier: TierDef;
  balance: number;
}

/** Who is making this request. Wallet sessions are added in the auth stage. */
export async function getViewer(req: Request): Promise<Viewer> {
  const ip = clientIp(req);
  return { ip, ipHash: hashIp(ip), wallet: null, tier: tierById(0), balance: 0 };
}

/** Daily quota subject: wallet for holders, hashed IP for everyone else. */
export function quotaSubject(v: Viewer): string {
  return v.wallet && v.tier.id > 0 ? `w:${v.wallet}` : `ip:${v.ipHash}`;
}
