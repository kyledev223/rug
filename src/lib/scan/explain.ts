/** Template-based plain-English explanations. Used when the AI is unavailable. */
import type { CheckResult, CheckStatus, Explanation, ScanReport } from "./types";

type Lines = Partial<Record<CheckStatus, string>>;

const UNKNOWN = "We couldn't get the data for this check, so it is treated as a risk rather than a pass.";

const TEXT: Record<string, Lines> = {
  mint_authority: {
    pass: "Nobody can create new tokens anymore, so your share can't be diluted by surprise minting.",
    fail: "Someone still holds the power to create unlimited new tokens. They could mint and dump on holders at any time.",
  },
  freeze_authority: {
    pass: "Nobody can freeze holders' token accounts.",
    fail: "Someone can freeze any holder's tokens, which can stop you from selling. This is a common honeypot setup.",
  },
  token2022_extensions: {
    pass: "The token doesn't use special Token-2022 features that could take control away from holders.",
    warn: "The token uses Token-2022 features (such as fees or adjustable settings) that give its creator some extra control. Check the details below.",
    fail: "The token uses Token-2022 features that let someone move, block, or tax holders' tokens. This is a serious red flag.",
  },
  liquidity_depth: {
    pass: "There is a meaningful amount of money in trading pools, so trades are less likely to move the price wildly.",
    warn: "Liquidity is thin. Even small sales can crash the price, and it may be hard to exit.",
    fail: "There is almost no liquidity (or no pool at all). You may not be able to sell at any reasonable price.",
  },
  lp_status: {
    pass: "The main pool's liquidity can't be easily pulled by its creator.",
    warn: "Only part of the main pool's liquidity tokens were burned. The rest could be withdrawn.",
    fail: "Most of the main pool's liquidity tokens were not burned. Whoever holds them could pull the liquidity (a classic rug pull) unless they're locked somewhere we can't see.",
    unknown: "We couldn't automatically tell whether the main pool's liquidity is burned or locked. Treat it as possibly withdrawable.",
  },
  holder_concentration: {
    pass: "Tokens are spread across many holders, so no single wallet controls the price.",
    warn: "A few wallets hold a large share. If they sell, the price could drop sharply.",
    fail: "A small number of wallets control most of the supply. They could crash the price by selling.",
  },
  funding_clusters: {
    pass: "Among the top holders we could trace, none were funded by the same wallet.",
    warn: "Two top holders were funded by the same wallet, which can mean one person controls both. (Heuristic: it can also be an exchange.)",
    fail: "Several top holders were funded by the same wallet around the same time, a pattern seen when one person spreads tokens to look decentralized. (Heuristic.)",
    unknown: "We couldn't trace enough wallets' funding sources to look for coordinated wallets.",
  },
  fresh_wallets: {
    pass: "Most top holders are established wallets, not brand-new ones.",
    warn: "Several top holders are brand-new wallets, which is sometimes a sign of coordinated buying. (Heuristic.)",
    fail: "Most profiled top holders are brand-new wallets, a common pattern in manufactured launches. (Heuristic.)",
  },
  dev_holdings: {
    pass: "Wallets linked to the creator don't hold a large share.",
    warn: "A wallet linked to the creator holds a noticeable share and could sell it.",
    fail: "A wallet linked to the creator still holds a large share. A sale could hurt the price badly.",
    unknown: "We couldn't identify a creator wallet (authorities were revoked and no creator is recorded).",
  },
  token_age: {
    pass: "The token has been trading for a while.",
    warn: "The token is very young. Most rugs happen in the first days.",
    fail: "The token was launched in the last hour. Extreme caution: almost nothing is known yet.",
  },
  market_activity: {
    pass: "Market cap and trading volume look active.",
    warn: "Market cap or trading volume is very small, which makes the price easy to manipulate.",
  },
  trade_balance: {
    pass: "Buys and sells look reasonably balanced.",
    warn: "Trading is very one-sided. Check whether people are able to sell.",
    fail: "Lots of buys but zero sells. This can mean selling is blocked (a honeypot).",
    unknown: "There weren't enough trades in the last 24 hours to judge.",
  },
  metadata_mutable: {
    pass: "The token's name, symbol, and image are locked and can't be changed.",
    warn: "The creator can still change the token's name, symbol, or image, which is sometimes used to impersonate other tokens.",
  },
  socials: {
    pass: "The token lists a website or social links. We only check that they exist, not that they're official.",
    warn: "No website or social links were found. Anonymous tokens with no presence carry extra risk.",
  },
};

export function explainCheck(c: CheckResult): string {
  return TEXT[c.id]?.[c.status] ?? (c.status === "unknown" ? UNKNOWN : c.summary);
}

const OVERVIEW: Record<ScanReport["label"], string> = {
  LOW: "Our automated checks found few risk signals for this token. That does not mean it's safe: new risks can appear at any time and some can't be detected on-chain.",
  MEDIUM: "Our automated checks found some risk signals. Review the warnings below before doing anything with this token.",
  HIGH: "Our automated checks found serious risk signals. Several warnings below describe ways holders could lose money.",
  CRITICAL: "Our automated checks found critical red flags, the kind often seen in rug pulls and honeypots. Read the failed checks below carefully.",
};

export function templateExplanation(r: ScanReport): Explanation {
  const fails = r.checks.filter((c) => c.status === "fail").map((c) => c.title.toLowerCase());
  let overview = `${OVERVIEW[r.label]} Risk score: ${r.score}/100 (${r.label}).`;
  if (fails.length) overview += ` Failed checks: ${fails.join(", ")}.`;
  if (r.coverage < 70) overview += ` Note: only ${r.coverage}% of checks had data, so this report is incomplete.`;
  return {
    source: "template",
    overview,
    checks: Object.fromEntries(r.checks.map((c) => [c.id, explainCheck(c)])),
    generatedAt: new Date().toISOString(),
  };
}
