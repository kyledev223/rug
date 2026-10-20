# RUG CHECK

A Solana token risk scanner. Paste a mint address and get a rules-based risk report. Every warning comes with on-chain
evidence: raw values, the accounts involved (linked to Solscan), the data source and the fetch time. Holders of the paired
token (`$RUGCHECK`, placeholder) unlock more usage.

> Automated risk signals, not financial advice. A low score does not mean a token is safe.

- **Rules decide, AI explains.** 14 checks produce a 0–100 score. Gemini only rewrites the results in plain English and
  falls back to templates when it's unavailable.
- **Unknown is never a pass.** A failed data source adds risk and lowers the report's "coverage" figure.
- **No fake numbers.** Every stat on the site comes from real scans.

Stack: Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Neon (serverless Postgres) ·
Solana wallet adapter · Google Gemini (`@google/genai`) · Helius RPC + DAS · DexScreener · Raydium API · Vitest.

---

## Contents

1. [Quick start](#quick-start)
2. [Environment variables](#environment-variables)
3. [Service setup](#service-setup): Helius, Gemini, Neon
4. [Deploy to Vercel](#deploy-to-vercel)
5. [Configuration](#configuration): rename, token mint, tiers
6. [How it works](#how-it-works)
7. [Testing](#testing)
8. [Security notes](#security-notes)
9. [Troubleshooting](#troubleshooting)

---

## Quick start

Requires Node.js 20.9+.

```bash
git clone https://github.com/kyledev223/rug.git
cd rug
npm install
cp .env.example .env.local   # fill in keys (see below)
npm run dev                  # http://localhost:3000
```

The app runs with **no keys at all**, but some things are degraded:

- Without `HELIUS_API_KEY` it uses the public Solana RPC, which rate-limits `getTokenLargestAccounts`. Holder and wallet
  checks then show **unknown**, and DAS metadata falls back to reading the Metaplex account directly.
- Without `GEMINI_API_KEY` reports use template explanations.
- Without `DATABASE_URL` it uses **in-memory storage**: fine for local development, but it isn't shared across
  serverless instances and resets on restart. **Configure Neon for any real deployment.**

## Environment variables

All keys are read server-side only. See [`.env.example`](.env.example).

| Variable | Required | Purpose |
| --- | --- | --- |
| `HELIUS_API_KEY` | recommended | Helius RPC + DAS (`getAsset`). |
| `SOLANA_RPC_URL` | no | Custom RPC, used only when `HELIUS_API_KEY` is empty. |
| `GEMINI_API_KEY` | no | AI explanations. |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.8-flash` (newest free-tier Flash as of Oct 2026). |
| `DATABASE_URL` | prod | Neon Postgres connection string (server only). |
| `SESSION_SECRET` | prod | 32+ random chars; signs session cookies. The app refuses to start in production without it. |
| `IP_HASH_SALT` | no | Salt for hashing IPs (IPs are never stored raw). Defaults to `SESSION_SECRET`. |
| `CRON_SECRET` | for alerts | Protects `/api/cron/alerts`. |
| `NEXT_PUBLIC_SITE_URL` | prod | Public URL for OG images and links. |
| `NEXT_PUBLIC_TOKEN_MINT` | at launch | Holder token mint. Empty = token section hidden, everyone free tier. |
| `DEV_FORCE_TIER` | no | `0`–`3`: force a tier for signed-in wallets in `next dev`. **Ignored in production.** |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Service setup

### Helius (Solana RPC + DAS)

1. Create a free account at <https://dashboard.helius.dev>.
2. Copy the API key into `HELIUS_API_KEY`.
3. That's it. The app builds `https://mainnet.helius-rpc.com/?api-key=…` server-side, so the key never reaches the browser.

A fresh scan makes roughly 25–35 RPC calls (mint, holders, owners, up to 10 wallet histories and their first transactions,
dev balances). Results are cached for 5 minutes per mint, and RPC concurrency is capped at 5 with retry on 429.

### Google Gemini

1. Get a key at <https://aistudio.google.com/apikey>.
2. Set `GEMINI_API_KEY`. Optionally set `GEMINI_MODEL`. Check <https://ai.google.dev/gemini-api/docs/models> for the
   newest Flash model on the free tier.
3. Only structured check results are sent (no raw RPC data). A system prompt forbids "safe" claims, trading advice and
   contradicting the score, and a server-side guard rejects output that breaks those rules. Calls are capped at 9/minute
   globally to stay inside the free quota. Anything over the cap gets the template explanation.

### Neon (Postgres)

1. Create a free project at <https://neon.tech>, or add Neon from the Vercel Marketplace (**Storage → Neon**), which
   sets `DATABASE_URL` on your Vercel project automatically.
2. Copy the **pooled** connection string (its host contains `-pooler`) into `DATABASE_URL` in `.env.local`.
3. Create the schema:

   ```bash
   npm run db:migrate
   ```

   This applies [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql). The migration is idempotent, so re-running
   it is safe. You can also paste the file into the Neon SQL Editor.

The app talks to Neon with `@neondatabase/serverless` over HTTP (one round trip per query, no connection pool to manage
in serverless functions). There is no browser-facing database API: only the server holds `DATABASE_URL`.

## Deploy to Vercel

1. Push this repo to GitHub (done) and click **Add New → Project** in Vercel. Import the repo; the framework preset is
   detected automatically.
2. Add the environment variables from the table above (Production and Preview). At minimum: `SESSION_SECRET`,
   `DATABASE_URL`, `HELIUS_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`. Run `npm run db:migrate` once against the
   production database (locally, with that `DATABASE_URL`).
3. Deploy. Scan routes declare `maxDuration = 60`.
4. **Alerts.** [`vercel.json`](vercel.json) registers a daily cron (Hobby plans allow one run per day) that calls
   `/api/cron/alerts` with `Authorization: Bearer $CRON_SECRET`. For checks every 30 minutes on the free tier, add the
   repository secrets `APP_URL` and `CRON_SECRET` in GitHub. The included workflow
   [`.github/workflows/alerts-cron.yml`](.github/workflows/alerts-cron.yml) then triggers the sweep. Watchlists are also
   re-checked whenever their owner opens `/watchlist`.

## Configuration

Everything is in [`src/lib/config.ts`](src/lib/config.ts):

- **Rename the app:** `APP_NAME`, `APP_SHORT`, `TOKEN_TICKER`. The pixel-font wordmark is generated from `APP_NAME`.
- **Token mint:** set `NEXT_PUBLIC_TOKEN_MINT` (or `TOKEN_MINT` in config). Until then the contract-address section stays
  hidden and nobody qualifies for a holder tier.
- **Tiers:** edit `TIERS`: `minBalance` (whole tokens), daily scans, watchlist counts and sizes, bulk, alerts, API key.
- **Timing:** `BALANCE_RECHECK_MS` (3h), `SCAN_CACHE_TTL_MS` (5 min), `API_LIMITS`.
- **Scoring:** check weights live with each check in `src/lib/scan/checks/*`, and the penalty and label bands in
  `src/lib/scan/score.ts`. Update [`src/lib/scan/catalog.ts`](src/lib/scan/catalog.ts) to match; a test fails if the docs
  catalog drifts from the engine. Bump `ENGINE_VERSION` so stale cached reports are ignored.

| Tier | Requirement (placeholder) | Unlocks |
| --- | --- | --- |
| Free | none | 5 scans/day per IP |
| Holder I | ≥ 100,000 | 50 scans/day, history, 1 watchlist × 10 |
| Holder II | ≥ 1,000,000 | unlimited scans, bulk (25) + CSV, 5 watchlists, alerts |
| Holder III | ≥ 5,000,000 | everything + personal API key |

## How it works

```
src/
  lib/sources/        one module per data source (swappable)
    rpc.ts            JSON-RPC client: Helius or any RPC, bounded concurrency, retries
    helius.ts         DAS getAsset + off-chain metadata socials
    metaplex.ts       Metaplex metadata decoder (fallback without DAS)
    dexscreener.ts    pools, liquidity, volume, txns
    raydium.ts        LP burn % for Raydium pools
    known-accounts.ts verified pool/burn labels
  lib/scan/
    collect.ts        I/O: gathers a TokenSnapshot; source failures are captured, never thrown
    checks/*.ts       pure rules: snapshot -> {status, weight, evidence}
    score.ts          weighted score, floors, labels, coverage
    engine.ts         pure: snapshot -> ScanReport
    explain.ts        template explanations
    run.ts            5-min cache (memory + Postgres), in-flight de-dup
  lib/ai/gemini.ts    explanation layer + policy guard
  lib/auth/           sign-in message, signature verify, session cookie, tiers, API keys
  lib/alerts/         snapshot diff + sweep runner
  lib/db/             Repo interface: Neon implementation + in-memory dev fallback
db/migrations/        SQL schema (npm run db:migrate)
```

**Checks:** mint authority · freeze authority · Token-2022 extensions · liquidity depth · LP burned/locked · holder
concentration (pools/burn excluded and labeled) · shared funding source* · fresh wallets* · dev wallet holdings* · token
age · market cap & volume · buy/sell balance · metadata mutability · socials. (*heuristic.) The full thresholds,
weights, floors and limitations are on the `/docs` page, generated from `catalog.ts`.

**Score** = `round(100 × Σ(weight × penalty) / Σ weight)` with penalties pass 0, unknown 0.4, warn 0.5, fail 1. Hard red
flags (permanent delegate, active transfer hook, zero-sells honeypot signal…) raise the score to a floor of 50 or 75.
Labels: LOW < 25 ≤ MEDIUM < 50 ≤ HIGH < 75 ≤ CRITICAL.

**Wallet verification:** the server issues a single-use nonce. The wallet signs a plain-text message (no transaction),
the server verifies the ed25519 signature, reads the token balance on-chain and sets an HMAC-signed httpOnly cookie. The
balance is re-checked every 3 hours and on each new session.

**Pages:** `/` · `/scan/[mint]` (with OG image) · `/bulk` · `/watchlist` · `/account` · `/token` · `/docs` · `/api-docs`.

## Testing

```bash
npm test          # vitest: scoring engine fixtures, guards, auth flow, alerts, API keys
npm run typecheck
npm run lint
npm run build
```

- `tests/fixtures/snapshots.ts` holds a **known-good** profile (expects LOW, every check passing), a **known-bad** rug
  profile (expects CRITICAL, with specific failures and evidence) and a **data-outage** profile (expects unknown statuses
  and a non-zero score).
- `tests/auth.test.ts` runs the real nonce → sign → verify route handlers with a generated keypair, plus replay, forged
  signature and cross-origin cases.
- `tests/repo-contract.ts` defines the behaviour every storage backend must satisfy (ownership checks, single-use
  nonces, counters, alert queue…). `tests/repo.test.ts` runs it against the in-memory repo. The Neon repo was verified
  with the same suite against real Postgres (PGlite behind Neon's HTTP protocol).
- `tests/stage4.test.ts` covers alert diffing, CSV formula-injection escaping, the webhook allowlist, gated watchlist and
  API-key routes, and the cron secret.

To try gated features locally before the token exists, set `DEV_FORCE_TIER=3` in `.env.local` and verify any wallet.

## Security notes

- No seed phrase or private key is ever requested. Verification is a message signature only.
- API keys, `DATABASE_URL` and the Helius key stay server-side. Holder API keys are stored as SHA-256
  hashes and shown once.
- All API routes are rate limited per IP and/or per wallet/key. Mutating cookie routes reject cross-origin requests.
- Inputs are validated: base58 32-byte keys, mint-account ownership checks, body size caps.
- Outbound fetches driven by token data (metadata URIs) refuse private/internal hosts. Alert webhooks only accept
  `discord.com/api/webhooks/…`.
- CSV exports escape formula-like cells, since token names are attacker-controlled.
- Errors are logged server-side with API keys redacted. Users see friendly messages.

## Troubleshooting

- **Holder checks always "unknown":** you're on the public RPC (HTTP 429). Set `HELIUS_API_KEY`.
- **Dev server reloading in a loop or serving stale modules after `npm install`/`uninstall`:** stop it, delete `.next/`
  and restart. Turbopack's persistent cache can go stale, especially inside synced folders such as OneDrive.
- **"Free limit reached" while developing:** quotas are in memory without `DATABASE_URL`. Restart the dev server, or verify a
  wallet with `DEV_FORCE_TIER`.
- **No AI explanations:** check `GEMINI_API_KEY` and `GEMINI_MODEL`. Template explanations are expected when Gemini is
  rate-limited or its output fails the policy guard; server logs say which.
