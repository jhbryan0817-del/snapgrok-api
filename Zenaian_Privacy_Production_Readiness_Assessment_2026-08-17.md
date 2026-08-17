# Zenaian privacy implementation and production-readiness assessment

**Assessment date:** 17 August 2026 (Asia/Singapore)  
**Repository reviewed:** `jhbryan0817-del/snapgrok-api`  
**Exact `main` head reviewed:** `6cabad9f807b78aa0ba7c289f24d737dff0b0ec8`  
**Review type:** Read-only critical assessment; no code, database, or Render configuration was changed.

## Executive verdict

This iteration is a substantial and mostly deliberate privacy-engineering improvement, not a rushed patch. It materially fixes the two highest-risk architectural omissions from the previous review: the deletion replay record now resides in a separate database, and repeated xAI ZDR failures now persistently disable analysis. The live API also fails closed when the external ledger is absent and currently reports healthy privacy maintenance, no deletion backlog, and an enabled ZDR latch.

It is **not yet ready for an unrestricted production launch**. The privacy architecture is much closer, but several release-blocking gaps remain:

1. The required human-readable **View my data** function was removed rather than corrected.
2. Restore handling remains incomplete: replay is capped at 5,000 deletions, does not replay retention-purge markers, and has not been proven in a real restore exercise.
3. Both PostgreSQL instances accept external connections from `0.0.0.0/0`; database-role setup also produced permission errors and the final least-privilege state is not captured as release evidence.
4. The release suite is not fully green and the real PostgreSQL path—including migration 007 and the external ledger—is not covered by an executed integration test.
5. Most non-Render vendor and operational privacy gates remain unevidenced.

My calibrated estimate is:

| Area | Readiness | Assessment |
|---|---:|---|
| Core privacy code | 80% | Strong design and meaningful fail-closed controls, with specific recovery and monitoring defects remaining. |
| Deployed Render configuration | 65% | Correct region, separate databases, runtime identities, health endpoint, and PITR; unsafe external network rules and weak resilience remain. |
| Release assurance | 55% | Builds and most tests pass, but the website suite is red and the real-database suite is skipped/incomplete. |
| External operational compliance | 35% verified | The repository checklist is still blank; xAI, Whop, Workspace, Hosting.kr, and Chrome Web Store evidence was not supplied. |
| Overall launch readiness | **Not ready** | Suitable for continued controlled testing, not a final public production sign-off. |

The percentages are engineering judgments, not legal conclusions. Release gates are binary: an unverified required control remains open even when most underlying code exists.

## Scope and source hierarchy

The controlling requirements were taken from the five supplied final PDFs:

1. Data Processing, Retention and International Transfer Register
2. Privacy Policy Decisions
3. Internal Privacy Operations SOP
4. Public Legal Documents
5. Agentic Implementation Specification

The fifth document was treated as the implementation baseline; the register, policy decisions, SOP, and public documents were used to detect operational and public-claim mismatches. The bracketed legal/operator details were excluded from the launch-blocker count at the user's request. The absent website `.env.example` and `.gitignore` files are recorded as acknowledged release-packaging work rather than a newly discovered privacy defect.

## What changed and whether it was effective

The current `main` is seven commits and 39 changed files beyond the earlier deployed baseline `4092bceabc3913e5c9b80871c6fbfb58de9548b5`.

### Effective, production-oriented changes

- **External deletion ledger:** Completed deletions are now written before the main deletion queue drops the raw Clerk ID. The ledger is a separate PostgreSQL database, encrypts the Clerk ID with AES-256-GCM, uses an append-only trigger, and gives the API a `SELECT`/`INSERT` path rather than `UPDATE`/`DELETE`.
- **Fail-closed deployment:** A deploy on 16 August failed because the external ledger URL and encryption key were missing. That failure is desirable evidence that production does not silently run without the required control. A later deploy succeeded after configuration was supplied.
- **Persistent ZDR circuit breaker:** Migration 007 introduces a durable latch. At the configured threshold of three consecutive `XAI_ZDR_REQUIRED` failures, analysis becomes disabled and `/api/health` becomes degraded until an explicit operator reset.
- **Maintenance observability:** Health now exposes last attempt, last success, last failure, failure count, deletion backlog, and ZDR state. Failed daily purges remain due and retry on the next five-minute cycle.
- **Recent-auth coordination:** The server's configured ten-minute window is returned to the website, removing the former hard-coded mismatch.
- **Export reliability:** The browser object URL is kept alive for one second instead of being revoked immediately.
- **Deletion sign-out:** The website clears extension access, explicitly signs out of Clerk, and has a hard-navigation fallback to a public deletion-receipt page.
- **Identifier hygiene:** Prior raw-looking Clerk IDs in tests were replaced by clearly synthetic constants.
- **CSP fix:** The nonce proxy now also covers app-rendered 404s such as a missing favicon. Current live checks return a CSP header on `/`, `/account`, and the favicon 404.

These changes are coherent, defensive, and tied directly to the previous findings. They are not merely issue-specific workarounds.

### Changes that are incomplete or regressive

- **View my data was removed.** The changelog describes this as removal of a misleading summary, but the requirement was to replace it with a human-readable view built from the user's actual data. The current account page offers only JSON download and deletion. This contradicts documents 2, 3, 4, and 5, breaks the repository's own test, and leaves the public privacy statement inaccurate.
- **Recovery replay is bounded but not paginated.** The replay command requests a maximum of 5,000 rows once. More than 5,000 post-restore deletions can never be reached because rerunning retrieves the same first page.
- **Retention purges are not replayed.** The SOP requires post-restore deletion and retention-purge markers to be replayed before traffic resumes. The new ledger records only completed account deletions. A restore can therefore resurrect data previously removed by scheduled retention until maintenance purges it again.
- **Ledger retention is undefined.** The append-only table contains encrypted raw Clerk IDs and HMACs indefinitely. No retention period, partition rotation, controlled archive, or disposal rule is implemented.
- **Key-rotation idempotency is fragile.** If the ledger insert succeeds but main-database completion fails, then the current encryption key changes before retry, the same request ID is recomputed with a different subject HMAC and is rejected as an identity conflict.
- **Deletion SLA health is incomplete.** A deletion retry that returns `partial` is treated as a successful maintenance cycle. A non-zero due backlog also does not itself degrade health, and the health output contains no oldest-request age. The service can report healthy while a deletion is overdue.
- **Offer and complaint procedures are documentary, not operationally complete.** The offer snapshot records prices and source paths but not the exact Terms, Privacy, withdrawal/refund, and Whop checkout revisions it says must be captured. The support document describes a minimized case record, but no controlled case store, form, command, or executed evidence bundle exists.

## Previous-finding disposition

| Previous finding | Current status | Assessment |
|---|---|---|
| Deletion replay ledger lived in the restored database | **Materially fixed, with blockers** | Separate Render PostgreSQL and append-only encrypted ledger now exist. Pagination, retention-purge replay, ledger retention, key rotation, and restore-drill evidence remain open. |
| Repeated ZDR failures did not disable analysis | **Fixed** | Persisted threshold/latch, pre-analysis check, operator status/reset, health degradation, and tests are present. Live health shows enabled/0 failures. |
| Server tests failed due to extension folder naming | **Fixed** | Server result is 193 passed, 0 failed, 1 skipped. |
| Website tests failed only because hidden release files were absent | **Regressed by one functional failure** | Four failures are attributable to the acknowledged hidden files; a fifth fails because View my data and its summary route were removed. |
| Real PostgreSQL behavior was unverified | **Still open** | `TEST_DATABASE_URL` was unavailable. The integration test also applies only migrations 001-006, not 007, and does not exercise a real external ledger. |
| External privacy gates were unverified | **Still mostly open** | Render was partially verified in this review; the repository evidence checklist remains blank and other vendor evidence was not provided. |
| Human-readable data view was generic | **Regressed** | It is now absent, rather than populated with actual account data. |
| Maintenance health was invisible | **Mostly fixed** | Rich status is visible; overdue/partial deletion semantics are still insufficient. |
| Failed purge waited about a day | **Fixed** | The daily gate advances only after a successful bounded purge. |
| Reverification window was hard-coded | **Fixed** | Server-provided `afterMinutes` is used; production is configured to ten minutes. |
| Download URL was revoked synchronously | **Fixed** | Revocation is delayed one second. |
| Deletion did not explicitly sign out | **Fixed** | Explicit cleanup/sign-out plus hard-navigation fallback exists. |
| Raw Clerk-style test identifiers | **Fixed** | Clearly synthetic identifiers are used. |
| Offer/support archive process absent | **Partially addressed** | Written procedures and one baseline snapshot exist, but the records are not self-contained or operationally evidenced. |

## Live Render findings

### Deployed services

| Resource | Observed configuration/state |
|---|---|
| Website (`snapgrok-api-1`) | Node Starter, Virginia, root `website`, live at commit `6cabad9`, version 6.15.2. |
| API (`snapgrok-api`) | Node Starter, Virginia, root `server`, live at commit `8804c89`, version 6.1.0. Commit `6cabad9` changes the website deletion overlay; the live API is on the latest server-bearing revision. |
| Primary PostgreSQL (`sneaksolve-billing`) | PostgreSQL 18, Basic-256mb, Virginia, 10 GB, 3-day PITR, no HA, storage autoscaling off. |
| External ledger PostgreSQL (`zenaian-deletion-ledger`) | PostgreSQL 18, Basic-256mb, Virginia, 5 GB, 3-day PITR, no HA, storage autoscaling off. |

The primary database has a logical export dated 15 August; Render states exports are retained for at least seven days. The ledger has no logical export yet. The two databases have distinct hosts and database names, satisfying the basic separate-restore-boundary requirement.

### Live API privacy state

The public health endpoint returned HTTP 200 with:

- `privacyReady: true`
- maintenance `healthy`
- last maintenance success on 17 August 2026
- deletion backlog `total: 0`, `due: 0`
- ZDR latch `enabled`, zero consecutive failures
- deployment revision `8804c89349e2e4e801e4d8141eed03e949a84a6e`

The API is configured for production/live billing, real xAI rather than mock mode, required ZDR, required exact origin, required production Clerk, required external deletion ledger, a ZDR threshold of three, and a ten-minute recent-auth window. The main and ledger runtime connection URLs use distinct custom runtime identities. No migration-owner URL is stored in the long-running API environment, which is appropriate.

### Render configuration blockers

1. **Both databases allow `0.0.0.0/0` external inbound access.** Password and TLS still apply, but the external attack surface is global even though the API uses Render's private network. This is not acceptable as the final security posture without a recorded necessity and compensating controls.
2. **Final role hardening is not release-proven.** Database logs show two failed setup statements at 22:58-22:59 on 16 August: a denied role grant and a denied `ALTER ROLE ... NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`. The live API demonstrates that required tables and DML permissions work, but its startup readiness probe does not prove absence of every unsafe ownership, membership, schema-create, database-create, or temporary-object privilege. The dedicated migration script's successful output/preflight needs to be captured.
3. **Migrations are not part of Render deployment.** The API pre-deploy command is blank and there is no separate migration service/job in the project. The current schema is present, but future deploy reliability depends on a manual step with no dashboard-enforced ordering.
4. **Database resilience is below production reliability.** Both databases are single Basic-256mb instances with 0.1 CPU, no HA, and no storage autoscaling. This may be acceptable for controlled testing, but it is a material availability and recovery risk for a public paid service, separate from performance tuning.
5. **Recovery proof is incomplete.** Both databases have 3-day PITR, but the external ledger has no logical export and no recorded end-to-end restore/replay drill.

### Log interpretation

- **`AUTH_REVERIFICATION_REQUIRED` on account deletion (401): expected fail-closed behavior.** The server correctly rejected a destructive request whose Clerk first-factor age was too old. The latest website overlay fix was deployed afterward; the UI flow still needs an authenticated browser qualification test.
- **`WEBHOOK_SIGNATURE_INVALID` (401): safe rejection, conditionally concerning.** A single invalid request was rejected and did not mutate billing state. If Whop's delivery dashboard shows that exact request as a genuine delivery, the webhook secret/signature configuration is wrong; if not, it is ordinary unsolicited traffic or a manual test.
- **Repeated `/favicon.ico` 404s: harmless.** They are normal missing-asset requests. The prior CSP-nonce exceptions occurred before the nonce-proxy fix was deployed. Current live checks show CSP on the favicon 404 and no fresh nonce error.
- **API deployment failure for missing ledger variables: positive control evidence.** The process exited before serving traffic, as required.
- **Frequent short PostgreSQL `postgres` sessions from private `10.x` addresses:** these are consistent with Render's internal database management/monitoring pattern, not the application. Application sessions are separately labelled `zenaian-api`, `zenaian-privacy`, `zenaian-extension-auth`, and `zenaian-deletion-ledger` under the custom runtime roles. No external client address or data-access statement was observed in the reviewed window.
- **WAL archive-push entries:** normal successful PITR activity, not an error.

## Verification results on exact current source

### Server

- Syntax/check command: passed
- Unit tests: **193 passed, 0 failed, 1 skipped** (194 total)
- Skipped test: real PostgreSQL integration because `TEST_DATABASE_URL` was not available
- Dependency audit: zero reported vulnerabilities

The skipped integration test is also incomplete for this iteration: it applies migrations 001-006 only. Migration 007 and the external ledger/replay command are covered by mocked/fake-pool tests rather than an actual PostgreSQL pair.

### Website

- Lint: passed
- Production build: passed using non-secret production-shape values
- Tests: **48 passed, 5 failed** (53 total)
- Dependency audit: zero reported vulnerabilities

Failure classification:

- Four failures arise from the acknowledged absence of `.env.example` and `.gitignore`, including dependent security/readiness assertions.
- One is a real product/specification failure: the test requires `View my data` and `/api/privacy/summary`, while the current account UI/API client removed them.

The release suite is therefore not green even after excluding the acknowledged packaging files.

## Alignment with the five documents

### Strongly aligned

- PIPA-first data minimization and no screenshot/prompt/answer history
- transient analysis content and in-memory result lifecycle
- xAI ZDR header enforcement and persistent fail-closed latch
- exact-origin, production Clerk, active-session, and recent-auth controls
- quota/payment/session/privacy schemas and scheduled retention periods
- narrow statutory archive separation
- deletion block, job cancellation, session revocation, Whop renewal cancellation, active-data deletion, Clerk-last ordering, and retry queue
- explicit four-acknowledgement plus typed-`DELETE` confirmation
- downloadable JSON excluding secrets, raw webhooks, card data, and non-retained content
- AI-use notice and result-title paths in the extension code/tests
- Render Virginia deployment and native PITR

### Partially aligned

- backup deletion replay: architecture exists, but the command and operational proof are incomplete
- 24-hour deletion completion: retry queue and counts exist, but overdue state does not degrade health or escalate
- offer and complaint retention operations: written, not fully captured/executed
- Render role isolation: runtime identities are in use, but the final privilege audit is not evidenced and setup logged errors
- Render recovery/log documentation: actual 3-day PITR and current plan were verified here, but the repository checklist remains blank

### Not aligned or not verified

- human-readable View my data page built from actual current data
- retention-purge replay before restored traffic resumes
- successful restore/replay drill including more than one page of ledger entries
- real-PostgreSQL verification of migration 007 and the external ledger
- restricted database external network access
- xAI dashboard ZDR evidence
- Whop mandatory legal acceptance and actual Korean checkout disclosures
- Google Workspace 2SV, no forwarding, US at-rest setting, and 365-day deletion
- Hosting.kr analytics/raw-log archival controls
- Chrome Web Store disclosure evidence

## Limitations that must be closed before production sign-off

The following list deliberately states acceptance conditions, not an implementation plan.

### Release-blocking

1. Restore the required human-readable data view and make it display the authenticated user's actual profile, plan, usage, recent payment, device-session summary, and applicable archive entries. Public copy and tests must agree with the behavior.
2. Prove recovery correctness for every post-restore deletion, beyond 5,000 entries, and for retention-purge effects before restored traffic is exposed.
3. Define and evidence a lawful/minimized retention and key-rotation lifecycle for the external deletion ledger.
4. Restrict or formally justify both databases' external inbound rules; capture the final network evidence without credentials.
5. Re-run and record the database migration/privilege preflight successfully after the logged role errors. The evidence must prove the runtime roles are non-owner, non-admin, and limited to the intended database/schema/table operations.
6. Make the complete release test suite green and execute a real two-database PostgreSQL integration path that includes migrations 001-007, ledger migration, deletion completion, restore replay, and ZDR latch persistence.
7. Complete the repository's external evidence checklist for xAI, Whop, Workspace, Hosting.kr, Render, and Chrome Web Store. Legal placeholders are excluded here, but actual vendor behavior and mandatory acceptance are not.

### High priority for production reliability

8. Make an overdue or repeatedly partial deletion visible as degraded/alerting state and prove the 24-hour completion target can be monitored.
9. Establish an ordered, repeatable migration release mechanism so new application code cannot become live before its schema and privilege checks succeed.
10. Complete self-contained offer snapshots and an auditable minimized complaint/dispute case workflow with retention/disposal evidence.
11. Resolve the single-instance/no-HA/no-autoscaling database risk or explicitly approve it as a documented limited-launch risk with tested recovery objectives.
12. Determine whether the invalid webhook signature was an actual Whop delivery. A genuine Whop request must not remain rejected in the final release.

## Bottom line

The iteration is a clear step toward production and fixes most of the earlier tactical defects. The live system is currently healthy, correctly fail-closed on the new ledger and ZDR controls, and safer than v6.0.0/v6.0.1.

However, production sign-off should remain **blocked**. The missing human-readable access function is a direct specification/public-policy regression; recovery guarantees are incomplete; database network and privilege evidence are not final; the real database/recovery paths are untested; and the external vendor gates remain open. These issues should be resolved before moving the primary focus to scalability or speed optimization.
