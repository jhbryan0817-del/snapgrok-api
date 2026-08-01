# SneakSolve API v5.4.1

Render-ready API with production Clerk authentication, exact-origin CORS,
PostgreSQL quotas, server-created Lemon Squeezy test checkout, signed webhook
processing, abuse controls, and transient screenshot analysis.

## API routes

| Route | Authentication | Purpose |
|---|---|---|
| `GET /api/health` | Public | Redacted health/version metadata |
| `POST /api/extension/pairings` | Clerk + exact website origin | Create a one-time extension pairing grant |
| `POST /api/extension/pairings/exchange` | Exact extension origin + one-time grant | Create an extension-bound device session |
| `POST /api/extension/session/refresh` | Exact extension origin + refresh credential | Rotate the extension session |
| `POST /api/extension/session/verify` and `/revoke` | Extension device session | Check or revoke the current device session using an origin-bearing JSON request |
| `POST /api/analyze-jobs` | Extension device session | Reserve quota and start transient analysis |
| `POST /api/analyze-jobs/:id/poll` and `/cancel` | Same extension device session | Poll or cancel transient analysis using an origin-bearing JSON request |
| `POST /api/analyze` | Clerk + allowed origin | Legacy rolling-deployment analysis route |
| `GET /api/billing/status` | Clerk + allowed origin | Return server-authoritative plan/usage |
| `POST /api/billing/checkout` | Clerk + exact website origin | Create an allowlisted paid checkout |
| `POST /api/billing/portal` | Clerk + exact website origin | Retrieve a fresh signed customer portal URL |
| `POST /api/billing/webhook` | Raw-body HMAC | Apply Lemon Squeezy subscription state |
| `GET /api/balance` | Clerk admin only | Optional xAI prepaid balance |

## Security and data boundary

- Clerk verifies the production token and the API confirms the live session
  before work and before returning an analysis result.
- The extension never receives Clerk cookies or Clerk tokens. A signed-in
  website creates a one-use pairing grant, and the resulting rotating device
  session is bound to the exact extension origin and live Clerk session.
- Screenshots, prompts, answers, tokens, and page content are not stored.
- Billing storage contains Clerk IDs, Lemon Squeezy resource IDs/status/dates,
  checkout intents, quota counters, operation UUIDs, and temporarily retained
  signed webhook payloads.
- Lemon Squeezy and PostgreSQL secrets remain server-side.
- Checkout maps `plus`/`ultra` to fixed variant IDs; the browser cannot choose
  provider IDs, model IDs, allowance, or entitlement.
- Webhooks are HMAC-verified before parsing and then strictly validate event,
  store, product, variant, resource, test mode, and Clerk checkout mapping.
- PostgreSQL transactions reserve and settle quota atomically across API
  processes.
- In-memory per-user/global limits remain abuse guards, not subscription
  quotas.

## Render

```text
Root Directory: server
Build Command: npm ci --ignore-scripts
Start Command: npm run start:render
Health Check: /api/health
Node: 22.13.1
```

The start command runs `scripts/migrate.js` before the server. Migrations are
tracked in `schema_migrations` and protected by a PostgreSQL advisory lock.

See `.env.example` and the root `DEPLOYMENT_GUIDE.md`. Use Render's internal
PostgreSQL URL. Never commit a populated `.env`.

## Quota behavior

- Free: 5 per UTC day, Grok 4.3.
- Plus: 200 per successful subscription cycle, Grok 4.3.
- Ultra: 300 per successful subscription cycle, Grok 4.5.
- Successful xAI results consume; technical failure releases; inconclusive
  consumes.
- A stable operation UUID prevents duplicate consumption.
- Successful renewal invoices advance the paid period. Retry changes to
  `renews_at` cannot reset quota.
- Lemon Squeezy access remains active in all statuses except `expired`;
  cancelled access stops at `ends_at`.

## Local verification

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
npm.cmd audit --omit=dev --audit-level=low
```

The PostgreSQL transaction test skips unless `TEST_DATABASE_URL` is set. CI
provides a disposable PostgreSQL 16 service and runs that test on every push
and pull request.

For reconciliation of already-mapped subscriptions:

```powershell
npm.cmd run billing:reconcile
```

