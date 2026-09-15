# Production release checklist

## Before merging or pushing

- [ ] Server, website, extension, dependency-audit, and code-scanning checks pass.
- [ ] No secret, migration-owner URL, customer data, screenshot, prompt, answer,
  or provider response was added to the repository or logs.
- [ ] Any schema change is forward-only and has a tested rollback/compatibility
  plan.
- [ ] The current Render plans and instance counts are unchanged unless spending
  approval was recorded.

## Database gate

- [ ] From a trusted short-lived environment, run `npm run release:databases`
  with the two migration-owner URLs and the two restricted runtime URLs.
- [ ] Confirm the ordered deletion-ledger migration/preflight succeeds before
  the main-database migration/preflight.
- [ ] Confirm every preflight safety field is true.
- [ ] Remove migration-owner URLs and any bootstrap flag before the long-running
  API starts. The runtime service keeps only restricted runtime credentials.

Do not deploy application code that requires a migration until this database
gate has succeeded. A failed gate stops the release; it is never bypassed by
starting the API with an owner credential.

## Deploy

- [ ] Push the reviewed commit to `main` and wait for required GitHub checks.
- [ ] Confirm both Render services deploy that exact commit only after checks pass.
- [ ] Confirm the API startup log reports Node 22.23.2 and the expected capacity,
  pool, privacy, and billing configuration.
- [ ] Confirm API `/api/live`, API `/api/health`, and website `/api/health` return
  HTTP 200.
- [ ] Complete one authenticated sign-in, device pairing, analysis, billing
  status, privacy view/export, and deletion-reverification smoke path as
  applicable to the release.

## Observe and close

- [ ] Review the first 30 minutes of Render request/application logs and CPU,
  memory, database-connection, and latency graphs.
- [ ] Confirm there are no new 5xx alarms, legitimate-user 429s, database waits,
  Whop reconciliation failures, privacy backlog, or ZDR latch event.
- [ ] Record the commit, deploy IDs, database-gate result, smoke-test result, and
  operator. Roll back application code if the release is unhealthy; never roll
  a database backward without following the recovery runbook.
