# Zenaian API v6.0.1

Render-ready API with production Clerk authentication, exact-origin CORS,
PostgreSQL quotas, server-created Whop checkout, signed webhook
processing, privacy controls, bounded retention, and transient screenshot
analysis with mandatory xAI zero-data-retention confirmation in production.

v6.0.0 adds authenticated data summary/export/account deletion, a separated
HMAC-indexed legal-retention archive, automatic operational-data purges,
privacy-safe Whop checkout mapping, and deletion-safe provider reconciliation.
It adds forward migration `006_privacy_compliance.sql`; it never rewrites an
already-applied migration.

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
| `GET /api/billing/history` | Clerk + exact website origin | Return the signed-in user's sanitized payment history |
| `POST /api/billing/checkout` | Clerk + exact website origin | Create an allowlisted paid checkout |
| `POST /api/billing/cancel` | Clerk + exact website origin | Cancel renewal at period end |
| `POST /api/billing/reactivate` | Clerk + exact website origin | Reactivate a canceled renewal while access remains active |
| `POST /api/billing/webhook` | Standard Webhooks signature | Apply Whop membership, payment, refund, and dispute state |
| `GET /api/privacy/summary` | Recent Clerk auth + exact website origin | Return current data categories, retention, transfers, and deletion availability |
| `GET /api/privacy/export` | Recent Clerk auth + exact website origin | Return a JSON account-data export without credentials or content history |
| `POST /api/privacy/delete-account` | Recent Clerk auth + exact website origin + exact confirmation schema | Start or resume idempotent account deletion |
| `GET /api/balance` | Clerk admin only | Optional xAI prepaid balance |

## Security and data boundary

- Clerk verifies the production token and the API confirms the live session
  before work and before returning an analysis result.
- The extension never receives Clerk cookies or Clerk tokens. A signed-in
  website creates a one-use pairing grant, and the resulting rotating device
  session is bound to the exact extension origin and live Clerk session.
- Screenshots, prompts, answers, tokens, and page content are not stored.
- A production analysis result is accepted only when xAI returns
  `x-zero-data-retention: true`; a missing or negative confirmation discards
  the response and releases the reserved quota operation.
- Billing storage contains Clerk IDs, Whop resource IDs/status/dates,
  checkout intents, quota counters, operation UUIDs, event hashes, and a
  sanitized event audit and payment-history record. Full Whop payment payloads
  and payment-method details are not retained.
- Whop and PostgreSQL secrets remain server-side.
- Checkout maps `plus`/`ultra` to fixed plan and product IDs; the browser cannot choose
  provider IDs, model IDs, allowance, or entitlement.
- Retired plan IDs are recognition-only allowlists. They can reconcile existing
  records but can never be selected by the checkout endpoint.
- Webhooks use Standard Webhooks verification before parsing and then strictly
  validate timestamp, event, company, product, plan, resource, and Clerk
  checkout mapping.
- PostgreSQL transactions reserve and settle quota atomically across API
  processes.
- In-memory per-user/global limits remain abuse guards, not subscription
  quotas.
- New Whop checkout configurations contain no Clerk ID, email, local checkout
  UUID, or custom user metadata. Provider checkout, membership, and payment IDs
  are mapped through server-created database records.
- Account deletion is persistently blocked before destructive/external work,
  cancels renewal-capable Whop memberships, removes operational rows, deletes
  Clerk last, and retries safely after provider/process failure.
- An unmapped Whop checkout configuration is retained after account deletion
  only as provider mode/checkout/company/product/plan identifiers. It contains
  no Clerk ID or email and permanently blocks a late purchase from recreating
  access. Whop currently documents neither checkout-configuration revocation
  nor a bounded checkout lifetime; revisit this retention if that changes.
- The separated `legal_retention` schema contains only minimum transaction
  evidence and dedicated-key HMAC identifiers—never raw email, Clerk ID, card,
  billing-address, screenshot, prompt, or answer data.
- Daily-gated, bounded maintenance enforces the documented 30-day, 90-day,
  12-month, 3-year, 5-year, and one-year retention boundaries.

## Render

```text
Root Directory: server
Build Command: npm ci --ignore-scripts
Start Command: npm start
Health Check: /api/health
Node: 22.13.1
```

Migrations are a separate, intentional release step. Never place the
DDL-capable `MIGRATION_DATABASE_URL` on the long-running Render API service.
Run `npm run migrate` from a trusted migration environment with both the owner
URL and a restricted runtime URL, then deploy the API with only the restricted
runtime `DATABASE_URL`. Migrations are tracked in `schema_migrations` and
protected by a PostgreSQL advisory lock.

Production migration requires a separate DDL-capable migration credential, a
restricted runtime `DATABASE_URL`, and the matching `DATABASE_RUNTIME_ROLE`.
The migrator verifies its actual session identity, validates that the roles
differ, rejects dangerous attributes/membership/ownership, and grants only
schema use plus table DML and sequence access. It removes schema/database
creation and temporary-table privileges and denies runtime access to
`schema_migrations`. `REQUIRE_DATABASE_LEAST_PRIVILEGE=true` is forced whenever
`NODE_ENV=production`.

Before the first v6 deploy, run the read-only legacy-data check:

```powershell
npm.cmd run privacy:preflight
```

Migration 006 intentionally refuses to drop the three obsolete Lemon Squeezy
tables if any rows remain. Review/archive real records, or delete only data
that you have positively identified as obsolete test data, before rerunning.

When a Whop price change creates a replacement plan ID, keep the replacement
in `WHOP_PLUS_PLAN_ID` or `WHOP_ULTRA_PLAN_ID` and place each retired ID in the
matching comma-separated recognition-only variable:

```text
WHOP_PLUS_LEGACY_PLAN_IDS=plan_previous_plus
WHOP_ULTRA_LEGACY_PLAN_IDS=plan_previous_ultra
```

Legacy IDs are optional, must be unique across both plans, and never create a
checkout. Keep them configured while any membership or payment created under
those IDs remains in the database or can still be returned by Whop.

Required new production configuration is
`PRIVACY_ARCHIVE_HMAC_KEY` (at least 32 random bytes, base64url). Keep
`PRIVACY_ARCHIVE_HMAC_KEY_VERSION=1` for the initial key. Never replace or
delete this key casually: retained HMAC lookup records depend on it.
`PRIVACY_ARCHIVE_PREVIOUS_HMAC_KEYS` is used only during a planned key
rotation. `REQUIRE_XAI_ZDR=true` is recommended explicitly and is forced on
whenever `NODE_ENV=production`.

See the root `DEPLOYMENT_GUIDE_PRIVACY_V6.0.0.md`. Use the restricted internal
PostgreSQL URL on Render; use direct external URLs only for the short-lived,
trusted migration step. Never commit a populated `.env`.

## Quota behavior

- Free: 5 per UTC day, Grok 4.3.
- Plus: 200 per successful subscription cycle, Grok 4.3.
- Ultra: 300 per successful subscription cycle, Grok 4.5.
- Successful xAI results consume; technical failure releases; inconclusive
  consumes.
- A stable operation UUID prevents duplicate consumption.
- `payment.succeeded` advances the paid period; a retry cannot reset quota.
- One paid plan is permitted per Clerk account. A paid checkout is blocked
  while Plus or Ultra remains entitled, including after renewal has been
  canceled but before the paid period expires. There is no in-period upgrade
  or downgrade path.
- `payment.failed`, refunds, and open/lost disputes immediately remove the
  affected membership's entitlement. Refunds and adverse disputes also turn
  off renewal at Whop. End-of-period user cancellation keeps access through
  the current `renewal_period_end` and can be reactivated before then.
- Automatic reconciliation refreshes mapped memberships, recovers a missed
  initial successful checkout from its server-created checkout mapping, and
  reapplies recently updated failed/refunded/disputed payment state. It is a
  recovery layer; signed webhooks remain the immediate path.
- Extension-session retention cleanup runs in bounded, indexed batches so a
  growing session table cannot monopolize the database maintenance window.

## Local verification

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
npm.cmd audit --omit=dev --audit-level=low
```

The PostgreSQL transaction test skips unless `TEST_DATABASE_URL` is set. Before
production deployment, point it at a disposable PostgreSQL 16 database and run
the full suite. Never use the production database as `TEST_DATABASE_URL`.

Normal reconciliation is automatic. The following command is available for an
operator diagnostic or an intentional one-off run:

```powershell
npm.cmd run billing:reconcile
```

