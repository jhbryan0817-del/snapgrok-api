# Privacy recovery runbook

This runbook is part of the production deletion control. A database restore is
not complete until post-restore deletions have been replayed.

## One-time setup

Provision a PostgreSQL database whose backup and restore boundary is separate
from the main application database. Create a DDL owner and a distinct runtime
role. The API runtime role must receive only `SELECT` and `INSERT` on
`completed_deletion_ledger`; it must not receive `UPDATE` or `DELETE`.

Configure the trusted migration environment with:

- `DATABASE_URL` pointing at the main application database, solely so the
  migrator can prove the ledger is a different database.
- `PRIVACY_DELETION_LEDGER_MIGRATION_DATABASE_URL` for the ledger DDL owner.
- `PRIVACY_DELETION_LEDGER_DATABASE_URL` for the ledger runtime role.
- `PRIVACY_DELETION_LEDGER_RUNTIME_ROLE` matching the runtime URL username.

Run `npm run deletion-ledger:migrate`. The migration creates an append-only
table with a trigger that rejects update and delete operations, then grants the
runtime role only append/read access.

Configure the API runtime with:

- `REQUIRE_EXTERNAL_DELETION_LEDGER=true`.
- `PRIVACY_DELETION_LEDGER_DATABASE_URL`.
- `PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY`, exactly 32 random bytes encoded as
  base64url.
- `PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY_VERSION=1`.
- `PRIVACY_DELETION_LEDGER_PREVIOUS_ENCRYPTION_KEYS` only during planned key
  rotation, using comma-separated `version:base64url` entries.

Production startup fails closed if this configuration is absent or if the
runtime role can mutate ledger rows. A deletion is marked complete in the main
database only after its Clerk ID has been encrypted into this external ledger.

## Point-in-time restore

1. Keep analysis, checkout, webhooks, and account traffic disabled while the
   main database is restored.
2. Record the exact restore point in UTC. Use a conservative earlier timestamp
   if the database restore tool reports a range rather than an instant.
3. Run the current main-database migrations against the restored database so
   the replay tool has the current safety schema. Do not migrate or restore the
   external deletion ledger to the old point.
4. Run a read-only preview:

   `npm run privacy:replay-deletions -- --after=2026-08-16T00:00:00.000Z --dry-run`

5. Review the receipt IDs and count. The command intentionally never prints
   decrypted Clerk IDs.
6. Run the replay without `--dry-run`, using the same timestamp. For every
   ledger entry, it first restores the durable deletion block, then removes
   resurrected entitlement, usage, checkout, session, and account rows and
   clears any restored deletion queue row.
7. Run the same command a second time. It is idempotent and must complete with
   the same receipt set and no error.
8. Run `npm run privacy:preflight`, billing reconciliation, and the complete
   smoke test. Confirm `/api/health` reports `maintenance.status: healthy`, a
   zero due deletion backlog, and an enabled ZDR safety latch before reopening
   traffic.

Do not restore the external deletion ledger to the main database restore
point. Its purpose is to retain the deletions that happened after that point.

## ZDR safety latch

`npm run zdr:status` reports the persisted latch without changing it. After
the configured number of consecutive `XAI_ZDR_REQUIRED` failures, production
analysis is disabled and health becomes degraded.

Reset only after dated xAI ZDR evidence has been re-verified and the failure
cause has been corrected:

`npm run zdr:reset -- --confirm=RESET_XAI_ZDR_LATCH`

Record the incident, evidence reviewed, operator, and reset time in the
release/incident record.
