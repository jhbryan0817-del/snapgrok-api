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
- repeated HTTP 5xx responses;
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

Expected quota and ingress HTTP 429s still generate operator alerts, but do not
degrade health. A client cannot poison readiness by repeatedly hitting a limit.

## Provider-spend and upload safeguards

`GLOBAL_XAI_ATTEMPTS_PER_DAY=5000` caps all upstream starts per UTC day, and
`FREE_XAI_ATTEMPTS_PER_DAY=1000` caps their free-tier subset. Per-account limits
are 15 starts/day for free users and 1000 for paid users. These counters include
each provider retry and format fallback. Cancellation releases an unsuccessful
question reservation but never refunds a started provider attempt. Counters
persist in the existing usage-period table across deploys; no migration is needed.

These are operational spending limits, separate from plan question allowances.
They bound account-farming damage but do not prove that multiple accounts belong
to different people. Keep Clerk's sign-up bot protection and email verification
enabled before marketing; monitor free-budget exhaustion and adjust deliberately.

Quota and attempt eligibility are checked before screenshot body allocation in
a separate 32-slot lane. The transactional question reservation and atomic start
counter remain authoritative when concurrent requests race. Invalid image bodies
use the bounded upload-memory budget but cannot acquire inference slots. Small
JSON account/pairing/refresh requests have an 8192-byte limit (including streamed
bodies) and a maximum five-second body-read timeout. Signed webhooks retain their
separate 256 KiB limit.

The optional `CANARY_USER_IDS`, `CANARY_RUN_ID`, and
`CANARY_MAX_XAI_ATTEMPTS` settings add a shared cumulative cap for dedicated test
accounts. This cap cannot exceed 400; midnight and restarts do not reset it.
Disable it by clearing `CANARY_USER_IDS` after account cleanup. Never use these
settings to bypass authentication, billing quotas, or provider ZDR enforcement.

`scripts/k6-capacity.js` exercises normal device authentication, async analysis,
long polling, account status, and anonymous rejection concurrently. Supply an
external `ACCOUNT_FILE` and synthetic `IMAGE_FILE`; credentials and customer data
must never enter Git or reports. Live tests require a configured durable canary
budget. Abort thresholds cover unexpected responses, control/admission latency,
and a 90-second analysis deadline. Teardown revokes test sessions and cancels
remaining jobs; delete the exact created accounts through the privacy workflow.

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
