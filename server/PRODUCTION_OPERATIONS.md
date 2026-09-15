# Production operations

This is the minimum operating procedure for the single-instance launch. It is
deliberately separate from capacity testing.

## Automated signals

GitHub Actions checks the API aggregate readiness endpoint and the public
website every ten minutes. Keep repository Action-failure notifications enabled
for the production operator. Render must also retain its default failed-deploy
and unhealthy-service notifications.

The API returns HTTP 503 from `/api/health` when any of these conditions occurs:

- repeated database readiness failures;
- repeated HTTP 5xx responses or a burst of HTTP 429 responses;
- three consecutive billing/Whop maintenance failures;
- failed privacy maintenance, an overdue or repeatedly partial deletion, or a
  disabled xAI zero-data-retention safety latch; or
- a process that is draining for restart.

The public response is intentionally aggregate-only. Use Render application
logs to identify the matching `operational_alert`,
`analysis_capacity_pressure`, `database_readiness_changed`,
`billing_maintenance`, or `privacy_maintenance` event. Never add credentials,
tokens, screenshots, prompts, answers, user identifiers, or provider response
bodies to these events.

## Response guide

| Signal | First response | Escalate when |
|---|---|---|
| API or website health failure | Check the latest deploy and Render logs; roll back a bad deploy | Two checks fail or users are affected |
| HTTP 5xx alarm | Group failures by safe error code and dependency | The alarm persists for five minutes |
| HTTP 429 alarm | Separate abuse/ingress, account quota, application capacity, and xAI throttling | Legitimate users are affected |
| Database pressure/readiness | Check connections, CPU, memory, waits, and slow operations | Readiness is degraded or waits recur |
| Whop maintenance | Confirm automatic reconciliation succeeds on the next cycle | Three consecutive cycles fail |
| Privacy backlog | Keep deletion work fail-closed and follow the privacy runbook | Any deletion is overdue or repeatedly partial |
| ZDR latch | Stop analysis and re-verify dated xAI ZDR evidence | Always; reset is an explicit operator action |

Do not increase a Render plan, instance count, or database size as an automatic
response. Diagnose first and obtain explicit spending approval.

## Release and recovery

Use [PRODUCTION_RELEASE_CHECKLIST.md](PRODUCTION_RELEASE_CHECKLIST.md) for every
production release. Use
[PRIVACY_RECOVERY_RUNBOOK.md](PRIVACY_RECOVERY_RUNBOOK.md) for a database
restore; a restored main database is not safe to reopen until the external
deletion-ledger replay completes.
