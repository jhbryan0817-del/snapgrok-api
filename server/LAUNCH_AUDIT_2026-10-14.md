# Launch audit — 14 October 2026

Scope: `server`, `website`, extension security boundaries, locked dependencies,
GitHub release workflows, and the two existing Render services. The intended
launch topology is one website instance and one API instance, with vertical
scaling. This is a code/configuration review and regression exercise, not a
complete penetration test or a certification of external vendor settings.

## Findings addressed in this release

| Finding | Impact | Change and evidence |
| --- | --- | --- |
| Google reused an unfinished password attempt | The signal-based `signIn.sso()` implementation can return without a redirect or an error when the attempt already has an ID and lacks an external verification URL. This explains a method-switching failure; the exact circumstances of every reported occurrence cannot be established from Render logs. | Use Clerk's public `authenticateWithRedirect()` with `continueSignIn: false`. Keep the existing callback, verification routes, and account destination. Tests cover switching after a password failure, rapid clicks, visible errors, and retry. |
| Auth actions could overlap before React rerendered | Two rapid clicks could start competing attempts despite the disabled state. | A synchronous ref guard covers password, recovery, and Google actions. Errors from the current action take precedence over stale password errors. |
| Malformed HTTP request targets escaped error handling | URL parsing happened before the handler's error boundary. A raw `//[` request reproduced an unhandled rejection locally; Node's default unhandled-rejection policy can terminate the process. Proxy handling of this target was not tested against production. | Return a redacted HTTP 400 with `INVALID_REQUEST_URL`. Regression coverage sends malformed GET and OPTIONS targets and then confirms the same server still serves liveness. |
| Whop body reads had no effective deadline or size bound | The timer stopped when response headers arrived, allowing a stalled body to hold billing resources. An unexpectedly large provider response could also exhaust memory. | Keep the deadline active through body consumption and cap each provider response at 1 MiB. Tests cover a stalled stream and oversized bodies with and without Content-Length. |
| Careers contact was stale | Resume applications targeted the old mailbox. | Change the mailto target to `info@zenaian.com`, retaining the application subject. Update the existing integrity assertion. |

The Clerk implementation inspected was the public SDK served by the production
Frontend API, version 6.39.0. The redirect API remains documented for Core 3's
legacy-compatible resource and matches the existing callback component:
[Clerk OAuth flow documentation](https://clerk.com/docs/guides/development/custom-flows/authentication/legacy/oauth-connections).
Track this compatibility path during future Clerk upgrades.

## Security and functionality review

- API authority remains server-side: Clerk JWT/session validation, authorized
  parties, live-session enforcement, and per-device ownership checks. Tests
  exercise revoked sessions, forged/malformed tokens, duplicate security headers,
  other users' jobs, and failures of authentication dependencies.
- Website/account state grants no subscription or model authority. Whop checkout
  catalog and redirect hosts are allowlisted; webhook signatures use raw bytes
  and timing-safe comparison with timestamp/replay defenses. Quotas, reservations,
  entitlement transitions, and idempotency have dedicated tests.
- Screenshot input has body/image validation, bounded ingress, byte-weighted
  admission, global/per-user limits, and adaptive backpressure. xAI responses are
  bounded and ZDR failure closes access. Analysis request content is cleared and
  is not persistently stored by this application's job manager.
- The website serves a nonce-based script CSP, frame denial, MIME protection,
  HSTS, and private/no-store headers on authentication/account routes. Public
  frontend configuration contains no backend credentials. SQL reviewed uses
  parameterized values; database mutation/readiness checks and restricted-role
  checks are covered by release tests.
- Privacy deletion has reverification, retry queues, separate deletion-ledger
  recovery, retention controls, and a durable ZDR safety latch. Vendor-side
  configuration still requires separate evidence.
- Both npm lockfiles reported **zero known vulnerabilities**, including dev
  dependencies, on 14 October 2026. This is a registry-advisory result, not proof
  that dependencies have no undiscovered vulnerabilities. Locked installation
  and pinned GitHub Action commits are already in place.
- The extension uses `activeTab`, one API host permission, an exact website
  external-message origin, and rotating device credentials. This release changes
  no extension package; its existing automated tests were run.

## Production observations

- Render `zenaian-web` and `snapgrok-api` both use `main`, Node 22.23.2,
  Starter plans, one instance, and automatic deployment after checks pass.
- At inspection, API liveness/aggregate health and website health returned HTTP
  200. A production Google sign-in completed to the account page in the existing
  browser context; Google can reuse an existing provider session without showing
  an account chooser. No password was entered, and no purchase/deletion was made.
- The requested error/warning and HTTP 500/502/503 log searches returned no
  entries for 7–14 October. The API event search found no failed/restarted servers
  in that period. These are bounded observations, not a guarantee about all logs
  or future behavior.
- Hourly API memory samples over the inspected day were approximately 66–87 MiB
  of 512 MiB; the website's highest hourly memory sample was about 108 MiB. CPU
  use was low. Three recent analysis logs showed 3.8–26.3 second total latency,
  mostly waiting on xAI, no database pool waits, and low event-loop delay.
- The API startup baseline is 25 concurrent analyses, a 96 MiB active-input
  budget, 80 control-plane slots, a shared 20-connection pool, and 25-second
  shutdown budget. Database admission permits 25 concurrent reservations and
  300 starts/minute. Keep these measured launch limits until further testing.
- Both PostgreSQL instances are available, private (empty external IP allowlist),
  and have no HA or read replicas. The connector could not inspect the private
  databases directly. No external networking access was added for this audit.

## Validation before push

- Node 22.23.2: API syntax checks passed; **239 API tests passed**, with the one
  disposable-database integration suite skipped locally.
- Website lint, TypeScript, production build, and **76 tests passed**.
- **18 extension tests passed**.
- Current dependency audits: 0 known vulnerabilities in both projects.
- The `Release checks` workflow runs the database integration suite against two
  disposable PostgreSQL 18 services and exercises migrations, restricted runtime
  roles, and deletion replay after restore. Its result must be verified on the
  pushed commit before recording deployment completion. No schema changes are
  required by this release.

## Remaining launch work and accepted topology limits

1. **Record external privacy evidence before commercialization.** The existing
   `EXTERNAL_PRIVACY_EVIDENCE_CHECKLIST.md` requires dated vendor evidence for
   xAI ZDR, Whop disclosures/acceptance, mailbox controls, hosting/log controls,
   database-role separation, and Chrome Web Store disclosures. The repository's
   blank checklist is not evidence these controls are absent, but this audit
   cannot certify them. Keep evidence outside the repository if sensitive.
2. **Finish the capacity canary with dedicated test users.** Low-load production
   metrics do not establish peak capacity. Follow `CAPACITY.md` before increasing
   limits; watch p95/p99 latency, legitimate 429s, database waits, model-provider
   limits, CPU, memory, and restarts. Vertical scaling adds CPU/memory but does
   not automatically change admission limits, provider quotas, or database size.
3. **Accept restart and single-instance availability limits.** Async analysis
   jobs/results and short-term rate limits live in process memory. A restart can
   interrupt active work and invalidate a pending job ID. Deploy drain cancels
   jobs and releases reservations; clients need to retry. One steady-state
   instance per service fits this design. Avoid multiple API instances without
   job routing/shared coordination work; rolling deployments may briefly overlap.
4. **Maintain recovery evidence and disk alerts.** The private databases have
   fixed 10 GiB/5 GiB disks, disk autoscaling disabled, and no HA. Verify backups,
   perform the documented deletion-ledger restore rehearsal, and set disk/health
   alerts. Availability remains dependent on one API process and the managed
   database; vertical scaling alone does not provide HA.
5. **Complete authenticated release smoke tests with dedicated accounts.**
   Automated MFA/recovery, billing, privacy, and pairing coverage is extensive,
   but live purchase/refund/deletion and extension pairing were not exercised in
   this audit. Avoid using an owner's account for destructive release tests.

Record the final commit, GitHub check results, Render deploy IDs, and
post-deployment health/smoke observations with the release record.
