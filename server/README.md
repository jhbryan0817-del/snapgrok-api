# Zenaian API v6.5.1

Render-ready API with production Clerk authentication, exact-origin CORS,
PostgreSQL quotas, server-created Whop checkout, signed webhook
processing, privacy controls, bounded retention, and transient screenshot
analysis with mandatory xAI zero-data-retention confirmation in production.

v6.0.0 adds authenticated data summary/export/account deletion, a separated
HMAC-indexed legal-retention archive, automatic operational-data purges,
privacy-safe Whop checkout mapping, and deletion-safe provider reconciliation.
It adds forward migration `006_privacy_compliance.sql`; it never rewrites an
already-applied migration.

v6.0.2 fixes PostgreSQL timestamp parameter typing in privacy-request audit
completion and retention cleanup. It also makes startup run a rollback-only
schema, privilege, and write-path readiness probe so an export-incompatible
database cannot advertise a healthy privacy service.

v6.1.0 adds a separate encrypted append-only completed-deletion ledger and
restore replay command, a persisted xAI ZDR circuit breaker, observable
maintenance health/backlog, immediate purge retry after failure, and dynamic
Clerk re-verification metadata.

v6.2.0 makes deletion and retention recovery fully paginated, records purge
markers outside the main restore boundary, defines a 400-day ledger-retention
window with controlled disposal, supports safe encryption-key rotation, and
degrades health for overdue or repeatedly incomplete deletion work. It also
adds one ordered migration-and-preflight command for both databases.

v6.4.0 raises the hard analysis maximum from 20 to 40 after isolated load
testing, adds a 96 MiB weighted in-flight request cap, adaptive pressure-based
admission, coordinated xAI pacing/backoff, and streamed upstream JSON. It also
uses five-second completion-aware long polling, a shared main PostgreSQL pool,
coalesced session-touch writes, content-free capacity telemetry, and bounded
analysis drain during shutdown. Extension v5.9 targets oversized images to 512
KiB using WebP and retries only transient capacity responses. See
[CAPACITY.md](CAPACITY.md) for the evidence, independent bottlenecks, probe
command, and production rollout criteria.

v6.5.0 hardens that candidate capacity for production rollout. Billing-backed
analysis reservations now take a PostgreSQL transaction advisory lock and
enforce shared concurrent/start-rate limits across API instances. The default
request ceiling is reduced from 15 MiB to 2 MiB, adaptive pressure is sampled
every 250 ms, the health endpoint includes cached database readiness, invalid
webhook bursts are bounded before repeated signature work, shutdown has an
explicit 25-second application budget, and Render is pinned to Node 22.13.1.
These controls do not make the transient analysis-job registry durable; see
[CAPACITY.md](CAPACITY.md) before enabling more than one API instance.

v6.5.1 accepts both Whop's documented literal webhook secret and the
Standard Webhooks `whsec_` serialization, adds a process-only Render liveness
endpoint, and gives harmless crawler requests explicit public responses.

## API routes

| Route | Authentication | Purpose |
|---|---|---|
| `GET /api/live` | Public | Process liveness for Render; independent of database and privacy maintenance readiness |
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
  the response and releases the reserved quota operation. Repeated failures
  trip a persisted production safety latch; analysis remains disabled until an
  operator re-verifies ZDR evidence and explicitly resets the latch.
- Billing storage contains Clerk IDs, Whop resource IDs/status/dates,
  checkout intents, quota counters, operation UUIDs, event hashes, and a
  sanitized event audit and payment-history record. Full Whop payment payloads
  and payment-method details are not retained.
- Whop and PostgreSQL secrets remain server-side.
- Checkout maps `plus`/`ultra` to fixed plan and product IDs; the browser cannot choose
  provider IDs, model IDs, allowance, or entitlement.
- Retired plan IDs are recognition-only allowlists. They can reconcile existing
  records but can never be selected by the checkout endpoint.
- Webhooks use Standard Webhooks verification before parsing, support both
  Whop's documented literal secret and serialized `whsec_` key derivation, and
  strictly validate timestamp, event, company, product, plan, resource, and Clerk
  checkout mapping.
- PostgreSQL transactions reserve and settle quota atomically across API
  processes. In billing modes, the same transaction also serializes global
  admission across instances and enforces a shared starts-per-minute cost cap.
- In-memory per-user/global limits remain abuse guards, not subscription
  quotas.
- New Whop checkout configurations contain no Clerk ID, email, local checkout
  UUID, or custom user metadata. Provider checkout, membership, and payment IDs
  are mapped through server-created database records.
- Account deletion is persistently blocked before destructive/external work,
  cancels renewal-capable Whop memberships, removes operational rows, deletes
  Clerk last, writes the completed deletion to an encrypted external
  append-only ledger, and retries safely after provider/process failure.
- An unmapped Whop checkout configuration is retained after account deletion
  only as provider mode/checkout/company/product/plan identifiers. It contains
  no Clerk ID or email and permanently blocks a late purchase from recreating
  access. Whop currently documents neither checkout-configuration revocation
  nor a bounded checkout lifetime; revisit this retention if that changes.
- The separated `legal_retention` schema contains only minimum transaction
  evidence and dedicated-key HMAC identifiers—never raw email, Clerk ID, card,
  billing-address, screenshot, prompt, or answer data.
- Daily-gated, bounded maintenance enforces the documented 30-day, 90-day,
  12-month, 3-year, 5-year, and one-year retention boundaries. A failed purge
  remains due for the next five-minute cycle, and `/api/health` exposes last
  success/failure, deletion backlog, ZDR latch state, and degraded readiness.

## Render

```text
Root Directory: server
Build Command: npm ci --ignore-scripts
Start Command: npm start
Health Check: /api/live
Node: 22.13.1
```

The v6.5 capacity defaults are intentionally conservative for the current
single Render Starter instance (0.5 CPU, 512 MiB RAM). Forty is a hard maximum;
adaptive admission can temporarily lower it to protect latency:

```text
MAX_CONCURRENT_REQUESTS_GLOBAL=40
DISTRIBUTED_MAX_CONCURRENT_ANALYSES=40
DISTRIBUTED_MAX_ANALYSIS_STARTS_PER_MINUTE=300
MAX_ACTIVE_ANALYSIS_MB=96
MAX_REQUEST_MB=2
XAI_MAX_STARTS_PER_SECOND=30
ANALYSIS_POLL_WAIT_MS=5000
EXTENSION_SESSION_TOUCH_INTERVAL_MS=60000
CONTROL_PLANE_MAX_CONCURRENT_REQUESTS=80
DATABASE_POOL_MAX=10
ADAPTIVE_CONCURRENCY_ENABLED=true
ADAPTIVE_MIN_CONCURRENT=10
ADAPTIVE_RECOVERY_MS=30000
ADAPTIVE_RSS_LIMIT_MB=358
ADAPTIVE_EVENT_LOOP_P99_MS=100
ADAPTIVE_DATABASE_WAITING_THRESHOLD=2
ADAPTIVE_SAMPLE_INTERVAL_MS=250
ADAPTIVE_PRESSURE_SAMPLES=3
DATABASE_READINESS_INTERVAL_MS=10000
DATABASE_READINESS_FAILURE_THRESHOLD=2
WEBHOOK_RATE_LIMIT_MAX_REQUESTS=60
WEBHOOK_MAX_CONCURRENT_REQUESTS=10
SHUTDOWN_TIMEOUT_MS=25000
```

These values are application guards, not a throughput SLA. The supplied xAI
account export reports Grok 4.3 at 37 starts/second and Grok 4.5 at 150
starts/second, so the 30/second local gate is conservative for that team; the
production API key's team association remains unverified. `/api/health` exposes
only aggregate readiness/adaptive status and limits; content-free performance
logs add RSS, event-loop, and database-pool evidence. Follow the staged canary in
[CAPACITY.md](CAPACITY.md) before keeping 40 under load or increasing it. The
isolated probe supports 80 only as laboratory headroom, not as a production
setting.

Migrations are a separate, intentional release step. Never retain either
DDL-capable migration URL on the long-running Render API service. Run the
ordered command below from a trusted, short-lived migration or pre-deploy
environment before switching application traffic:

```powershell
npm.cmd run release:databases
```

The command migrates and verifies the external ledger first, then migrates and
verifies the main database. It requires:

- `MIGRATION_DATABASE_URL`, `DATABASE_URL`, and `DATABASE_RUNTIME_ROLE`
- `PRIVACY_DELETION_LEDGER_MIGRATION_DATABASE_URL`
- `PRIVACY_DELETION_LEDGER_DATABASE_URL`
- `PRIVACY_DELETION_LEDGER_RUNTIME_ROLE`
- `PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY` and its configured key version/keyring

For a first release, set `MIGRATION_BOOTSTRAP_RUNTIME_ROLES=true` only when the
usernames embedded in the two runtime URLs do not exist yet. Each URL must
contain a strong password. The migration owner creates non-admin, non-inheriting
login roles, verifies their isolation, and then grants the bounded privileges.
Remove the bootstrap flag immediately after that successful run. Render-managed
rotating credentials are suitable for the short-lived migration owner, but the
long-running app should use these explicitly restricted PostgreSQL roles.

Migrations are tracked with advisory locks. Deploy the API with only the two
restricted runtime URLs and runtime encryption-key configuration.

If Render's API-service pre-deploy hook is used as the trusted migration
environment, treat the owner URLs and bootstrap flag as temporary. After the
gated deploy succeeds, clear the hook, remove those variables, and redeploy the
same commit once so the long-running process cannot inherit migration secrets.

Production migration requires a separate DDL-capable migration credential, a
restricted runtime `DATABASE_URL`, and the matching `DATABASE_RUNTIME_ROLE`.
The migrator verifies its actual session identity, validates that the roles
differ, rejects dangerous attributes/membership/ownership, and grants only
schema use plus table DML and sequence access. It removes schema/database
creation and temporary-table privileges and denies runtime access to
`schema_migrations`. `REQUIRE_DATABASE_LEAST_PRIVILEGE=true` is forced whenever
`NODE_ENV=production`.

The main-database preflight can still be run independently from the same
trusted migration environment. It requires both `MIGRATION_DATABASE_URL` and
the restricted runtime `DATABASE_URL`; this is necessary because the runtime
role is deliberately unable to read `schema_migrations`. The probe performs
temporary audit/archive writes inside a transaction and always rolls them back.

```powershell
npm.cmd run privacy:preflight
```

For the initial release, a pre-migration run can exit with code 2 while still
reporting `safeToApplyPrivacyMigration: true`. Then run the migration and the
preflight again:

```powershell
npm.cmd run migrate
npm.cmd run privacy:preflight
```

Do not deploy until the second result reports all of
`privacyMigrationApplied`, `privacyTablesPresent`, `privacyRuntimeReady`,
`safeToApplyPrivacyMigration`, and `safeForConfiguredBillingMode` as `true`.
After deployment, `/api/health` must report the expected version,
`privacyControls: true`, `privacyReady: true`, and
`maintenance.status: healthy`. Complete one authenticated **View my data**,
**Download file**, and account-deletion re-verification smoke test before
treating the release as healthy.

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

Production also requires an encrypted deletion ledger on a PostgreSQL database
outside the main restore boundary. Follow `PRIVACY_RECOVERY_RUNBOOK.md` to
migrate it, configure key rotation, replay post-restore deletions, and operate
the ZDR latch. A main-database restore is incomplete until that replay has run.

Use the restricted internal PostgreSQL URL on Render; use direct external URLs
only for the short-lived, trusted migration step. Never commit a populated
`.env`.

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

The PostgreSQL transaction test skips unless both `TEST_DATABASE_URL` and
`TEST_DELETION_LEDGER_DATABASE_URL` are set and
`ALLOW_TEST_DATABASE_RESET=RESET_ZENAIAN_TEST_DATABASES` is explicitly present.
Before production deployment, point them at two separate disposable PostgreSQL
databases and run the full suite. The test refuses ordinary/production-looking
database names and never accepts the same database for both roles.

Normal reconciliation is automatic. The following command is available for an
operator diagnostic or an intentional one-off run:

```powershell
npm.cmd run billing:reconcile
```

