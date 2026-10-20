import { LINKS, TOKEN_MINT, TOKEN_TICKER } from "@/lib/config";
import { CopyButton } from "./CopyButton";
import { btn } from "./ui";

/** Contract address block. Renders nothing until a real mint is configured. */
export function TokenSection() {
  if (!TOKEN_MINT) return null;
  return (
    <div className="card p-4 sm:p-6">
      <p className="text-[11px] uppercase tracking-widest text-muted">{TOKEN_TICKER} contract address</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-[3px] border border-line bg-paper-2 px-3 py-2 text-sm">{TOKEN_MINT}</code>
        <CopyButton value={TOKEN_MINT} label="copy CA" className={btn.primary} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <a className="link" href={LINKS.solscanToken(TOKEN_MINT)} target="_blank" rel="noopener noreferrer">
          solscan ↗
        </a>
        <a className="link" href={LINKS.dexscreener(TOKEN_MINT)} target="_blank" rel="noopener noreferrer">
          dexscreener ↗
        </a>
        <a className="link" href={`/scan/${TOKEN_MINT}`}>
          scan it with our own scanner →
        </a>
      </div>
      <p className="mt-3 text-[11px] text-muted">Always verify the address on this page. Never trust a contract address sent to you in DMs.</p>
    </div>
  );
}
