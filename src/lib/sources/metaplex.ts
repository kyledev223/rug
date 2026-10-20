/**
 * Reads the Metaplex Token Metadata account straight from RPC.
 * Fallback for when Helius DAS isn't configured.
 */
import { PublicKey } from "@solana/web3.js";
import { rpc } from "./rpc";

export const METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

export interface MetaplexMetadata {
  updateAuthority: string;
  name: string;
  symbol: string;
  uri: string;
  creators: string[];
  isMutable: boolean;
}

export function metadataPda(mint: string): string {
  const program = new PublicKey(METADATA_PROGRAM);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), program.toBuffer(), new PublicKey(mint).toBuffer()],
    program,
  );
  return pda.toBase58();
}

/** Decodes the fixed-prefix part of a Metadata account (borsh layout). */
export function decodeMetadata(data: Buffer): MetaplexMetadata {
  let o = 1; // key
  const pk = () => {
    const v = new PublicKey(data.subarray(o, o + 32)).toBase58();
    o += 32;
    return v;
  };
  const str = () => {
    const len = data.readUInt32LE(o);
    o += 4;
    const v = data.subarray(o, o + len).toString("utf8").replace(/\0/g, "").trim();
    o += len;
    return v;
  };
  const updateAuthority = pk();
  pk(); // mint
  const name = str();
  const symbol = str();
  const uri = str();
  o += 2; // seller_fee_basis_points
  const creators: string[] = [];
  if (data[o++] === 1) {
    const n = data.readUInt32LE(o);
    o += 4;
    for (let i = 0; i < n; i++) {
      creators.push(pk());
      o += 2; // verified + share
    }
  }
  o += 1; // primary_sale_happened
  const isMutable = data[o] === 1;
  return { updateAuthority, name, symbol, uri, creators, isMutable };
}

export async function getMetaplexMetadata(mint: string): Promise<MetaplexMetadata | null> {
  const r = await rpc<{ value: { data: [string, string] } | null }>("getAccountInfo", [
    metadataPda(mint),
    { encoding: "base64", commitment: "confirmed" },
  ]);
  if (!r.value) return null;
  return decodeMetadata(Buffer.from(r.value.data[0], "base64"));
}
