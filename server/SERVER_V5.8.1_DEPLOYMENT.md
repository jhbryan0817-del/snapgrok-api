# Zenaian API v5.8.1 localized reconciliation fix

This server-only release is derived from GitHub `main` commit
`7dfa666c753a974c7c83b66eda9864dc01b69d83`. The website and extension do not
need to be redeployed.

## Why the earlier errors stopped without a change

When no checkout is awaiting recovery, reconciliation asks Whop only for
payments updated within the preceding 24 hours. The refund or dispute payment
that exercised the stale replay path was retried every 15 minutes while it was
inside that window. Once it aged out, scheduled reconciliation stopped seeing
it. A later manual run could therefore report `failed: 0` without exercising
the defective record.

The old behavior did not corrupt the already-applied refund or dispute. The
signed webhook remained authoritative and the transaction for the older replay
rolled back. The defect affected the backup reconciliation path and would have
returned after another qualifying adverse payment.

## Changes

- Ignore and commit a payment replay when the mapped membership already has a
  newer state timestamp.
- Quarantine a payment whose membership catalog mapping changes.
- Query checkout-intent recovery only when the intent UUID, Clerk user ID, and
  Whop checkout ID are all syntactically valid.
- Preserve safe five-character PostgreSQL SQLSTATE values in scheduled
  reconciliation diagnostics without logging SQL, user data, or provider
  payloads.
- Add always-running scripted-store tests and a disposable-PostgreSQL regression
  scenario for refund replay and missing-intent handling.

No database migration or environment-variable change is required.

## Render deployment

Deploy only the `server` directory.

```text
Root Directory: server
Build Command: npm ci --ignore-scripts
Start Command: npm run start:render
Health Check Path: /api/health
```

Keep the existing server environment variables. After deployment:

1. Confirm `/api/health` returns HTTP 200 and version `5.8.1`.
2. Run `npm run billing:reconcile` once in Render Web Shell. Expect `failed: 0`
   and an empty `failures` array.
3. On a sandbox tester, apply one refund or dispute and confirm the account
   immediately becomes Free and payment history changes accordingly.
4. Wait through two scheduled cycles, approximately 30 to 35 minutes. Confirm
   there is no `BILLING_RECONCILIATION_INCOMPLETE` log.

The earlier checkout, cancellation, reactivation, and no-switch tests do not
need to be repeated because this release does not change those paths.

## Local verification completed

- JavaScript syntax check: passed.
- Targeted stale-replay and checkout-intent tests: 3 passed.
- Complete API suite: 102 passed, 1 skipped, 0 failed.
- Dependency audit: 0 known vulnerabilities.

The skipped test requires a disposable PostgreSQL `TEST_DATABASE_URL`. The
same stale-replay scenario is present in that integration test, while the
always-running scripted-store tests exercise the corrected query decisions on
every test run. The Render reconciliation command and post-refund scheduled
cycle are the final checks against the deployed PostgreSQL service.
