# Zenaian capacity and reliability

Last measured: 2026-08-29

## Decision

Use **40 concurrent analyses** as the candidate hard code-level maximum for the
current single Render Starter instance. Production is running v6.4 with that
configured maximum; the number is an application setting, not a Node.js or
Render guarantee. The v6.5 default is protected by a separate **96 MiB aggregate
request-body budget** and an **adaptive 10-40 admission window**, so concurrency
automatically falls when screenshots are large or sustained runtime pressure is
detected.

Forty concurrent requests with a ten-second end-to-end inference time has a
theoretical steady-state ceiling of about four completed analyses per second,
or 240 per minute. This describes requests from different users because each
user remains limited to one active analysis. It is not a production SLA:
Render CPU, actual screenshot sizes, xAI latency and rate limits, Clerk, and
PostgreSQL can each reduce the observed value. The best current code-only
estimate is therefore **40 as a guarded release candidate, with 80 only as
laboratory headroom for ordinary payloads**. There is not enough live evidence
to advertise 40 as an SLA or to configure 80 or higher.

Do not set the count to 80 in production merely because the small-payload probe
completed at 80. That test established headroom and failure behavior; it did
not reproduce the CPU allocation, network path, database load, personalized
xAI limits, or other traffic on the deployed Render service.

## What changed

- Analysis count and request-byte admission now happens before authentication,
  JSON buffering, and base64 validation. Rejected work cannot consume
  unbounded upload memory first.
- `MAX_ACTIVE_ANALYSIS_MB` limits declared aggregate analysis request bytes.
  Missing `Content-Length` reserves the full per-request maximum, failing safe.
- Image validation checks canonical base64 and file signatures without decoding
  another complete binary image copy.
- The xAI JSON body is streamed around the already-present image string instead
  of constructing one additional full serialized request string.
- `XAI_MAX_STARTS_PER_SECOND` smoothly spaces initial calls and retries per
  model. The default 30/s is below the currently documented entry-tier Grok
  4.3 request rate, but the xAI Console remains authoritative for this key.
- xAI `Retry-After` is coordinated per model across concurrent work. Repeated
  provider throttling halves new admission capacity; successful calls clear the
  failure streak and capacity recovers gradually.
- Job polling holds a request for up to five seconds and wakes immediately when
  the job finishes. This lowers authentication and database amplification while
  preserving the extension's existing polling protocol.
- Poll, cancel, and legacy job-status requests share a bounded 80-slot
  control-plane guard, leaving room for 40 long polls and ordinary account
  traffic while preventing unbounded poll sockets.
- Device-session `last_seen_at` writes are coalesced to at most once per minute
  per active session. Authentication and Clerk revocation checks still run.
- A device authentication result marks its privacy check, avoiding the same
  deletion-block query a second time in the route.
- SIGTERM/SIGINT stop new HTTP work, abort active analysis, release quota when
  the downstream cooperates, close runtime pools, and respect a hard deadline.
- Content-free performance logs include active request bytes for canary
  diagnosis, adaptive limit, RSS, event-loop p99, and shared database-pool
  counts without logging screenshots, prompts, answers, or tokens.
- Billing, device authentication, and ordinary privacy queries share one
  ten-connection main PostgreSQL pool. The separate privacy advisory-lock lane
  remains to avoid callback deadlocks. Main-database potential falls from 28
  connections to 14, and idle-client errors are handled without exposing
  database details.
- Extension v5.9 re-encodes oversized captures as efficient WebP toward a 512
  KiB binary-image target and retries only transient capacity responses with
  bounded jitter. Authentication, quota, and invalid-request failures are never
  retried.
- v6.5 reduces `MAX_REQUEST_MB` from 15 to 2. The 512 KiB extension target still
  has ample headroom, while one request can no longer block the event loop with
  a near-15 MiB JSON/base64 parse.
- Billing-backed reservations now take one PostgreSQL transaction advisory lock
  and enforce `DISTRIBUTED_MAX_CONCURRENT_ANALYSES` plus
  `DISTRIBUTED_MAX_ANALYSIS_STARTS_PER_MINUTE` across every API process sharing
  the database. No screenshot, prompt, answer, or model response is added to
  PostgreSQL.
- Cached `SELECT 1` probes make `/api/health` fail closed after repeated database
  failures without running a database query on every platform health request.
- Render probes `/api/live`, which reports only process lifecycle. Database or
  privacy-maintenance degradation therefore remains visible on `/api/health`
  and continues to fail application work closed without provoking restart loops.
- Adaptive pressure sampling now defaults to 250 ms, so three sustained samples
  reduce admission in roughly 750 ms instead of roughly three seconds. A sample
  at 125% of the event-loop threshold, twice the database threshold, or 110% of
  the RSS threshold sheds capacity immediately so a short severe spike is not
  missed.
- The signed billing webhook has a dedicated 60/minute, 10-concurrent process
  guard before repeated signature verification and JSON work.
- The API runtime is pinned to Node 22.13.1 and uses an explicit 25-second
  shutdown budget inside Render's default 30-second termination window.

## Isolated load-test evidence

The probe starts the real HTTP server in a separate process and exercises the
production route, body reader, validation, job lifecycle, long polling,
streamed xAI request construction, concurrency guards, and cleanup. Clerk,
PostgreSQL, and xAI are deterministic local stubs; no production account,
database, or API was called. Server RSS is sampled independently from the load
generator.

Run it from `server`:

```powershell
npm.cmd run capacity:probe -- --concurrency=40 --max-active=40 --analysis-ms=10000 --poll-ms=500 --body-kb=512
```

Measured results on the development machine:

| Scenario | Accepted/completed | Duration | Peak server RSS | p99 event-loop delay | HTTP requests |
|---|---:|---:|---:|---:|---:|
| 40 × 512 KiB, 10 s inference | 40/40 | 11.82 s | 108.13 MiB | 19.66 ms | 126 |
| 40 × 2 MiB, 1 s inference | 40/40 | 2.57 s | 208.46 MiB | 114.10 ms | 80 |
| 80 × 512 KiB, 1 s inference | 80/80 | 3.88 s | 151.82 MiB | 38.63 ms | 160 |
| 80 × 2 MiB, 1 s inference | 48/48; 32 safe 429s | 3.00 s | 210.68 MiB | 127.60 ms | 128 |

The v6.5 regression run on 2026-08-29 used the new 2 MiB request ceiling and
250 ms adaptive sampler:

| Scenario | Accepted/completed | Safe rejections | Duration | Peak server RSS | p99 event-loop delay | Final adaptive limit |
|---|---:|---:|---:|---:|---:|---:|
| 40 × 512 KiB, 10 s inference | 40/40 | 0 | 11.91 s | 111.56 MiB | 27.87 ms | 40 |
| 40 × 1.5 MiB, 1 s inference | 40/40 | 0 | 2.51 s | 164.57 MiB | 142.21 ms | 30 |
| 50 × 512 KiB, 1 s inference; max 40 | 40/40 | 10 | 2.55 s | 112.30 MiB | 104.01 ms | 40 |

The 1.5 MiB burst completed cleanly, but its short event-loop spike triggered
the new severe-pressure path and reduced later admission from 40 to 30 for the
cooldown. The overload run rejected the ten excess submissions immediately;
none failed after admission.

Before the memory/serialization changes, the equivalent 40 × 2 MiB, 1-second
probe peaked at 297.54 MiB RSS. The optimized run above peaked at 208.46 MiB,
about 30% lower. This is a single-host engineering measurement, not a
repeatable production benchmark.

The 80 × 2 MiB result demonstrates the weighted limiter: 48 bodies fit under
96 MiB and the other 32 were rejected immediately with
`ANALYSIS_MEMORY_LIMITED`; none failed after admission. At the production
count default of 40, the count guard is reached first for ordinary screenshots.

Approximate active capacity for average encoded JSON body size `P` MiB is:

```text
min(current adaptive limit, 40, floor(96 / P))
```

This budget covers request bytes, not total process RSS. Node, parsed strings,
database clients, TLS, responses, and operating overhead still need memory, so
do not tune the byte budget up to the Render memory limit.

## Independent capacity ceilings

1. **Render memory and CPU.** The production backend is one Starter instance
   with 0.5 CPU and 512 MiB RAM; autoscaling is off. Local RSS evidence supports
   the memory guard, but only a deployed canary can establish CPU and event-loop
   headroom on this exact allocation.
2. **xAI.** The supplied 2026-08-24 account export reports standard Tier 0
   per-team/per-model limits: Grok 4.3 at 1,800 requests/minute, 37 requests/
   second, and 10 million tokens/minute; Grok 4.5 at 7,200 requests/minute,
   150 requests/second, and 50 million tokens/minute. No separate concurrency
   quota was shown. The server's 30/s per-model start gate is below the lower
   37/s burst limit. The export does **not** establish that the production API
   key belongs to that team, so production 429s remain authoritative.
3. **PostgreSQL.** One process now shares ten ordinary main-database connections
   and can open four dedicated privacy-lock connections, plus two connections to
   the separate deletion ledger. Render currently documents 100 connections for
   Basic Postgres, leaving connection-count headroom, but production pool wait,
   query latency, locks, CPU, and connection graphs must be observed.
4. **Clerk and device authentication.** Every poll still proves the device
   session and deletion state. Clerk's live-session recheck has a short cache;
   revocation-sensitive behavior is unchanged. Long polling and touch
   coalescing reduce amplification but do not remove this dependency.
5. **Quotas and abuse guards.** Each user gets one concurrent analysis and ten
   starts per minute by default. The global request window, database-coordinated
   billing reservation, shared 300 starts/minute breaker, and provider quota can
   reject work before compute is the bottleneck.
6. **Payload distribution.** A count-only limit is unsafe for base64 images.
   v6.5 rejects requests above 2 MiB, so 40 maximum-size request bodies fit under
   the 96 MiB weighted budget with margin; sub-1 MiB captures normally reach the
   count cap first.
7. **Transient job ownership.** Analysis job state and terminal results remain
   process-local so screenshots and answers are never persisted. Database-backed
   admission is now multi-instance safe, but polling is not: a request routed to
   another instance cannot find the original job, and a process loss cannot
   resume it. Keep one API instance until a privacy-reviewed shared transient
   queue/result store is introduced.

## Authenticated production snapshot

The following read-only evidence was collected from Render through 2026-08-29. No
production load was generated and no configuration was changed.

- The API is one Starter web-service instance: 0.5 CPU, 512 MiB RAM,
  autoscaling disabled. Its root is `server`, platform liveness path is
  `/api/live`, and
  deploys occur after GitHub CI passes.
- The deployed backend revision is v6.4.0 (`4df2af3`) with 40 analysis slots,
  a 96 MiB weighted request budget, adaptive admission, and 80 control-plane
  slots.
- Render recorded 796 HTTP requests in the preceding seven days. Memory was
  ordinarily about 60-100 MiB and briefly about 120-130 MiB around a deploy.
  CPU was effectively idle at this traffic level. There was no observed OOM or
  runtime-restart pattern.
- Eight post-v6.4 content-free `analysis_performance` records all completed and
  all began at active concurrency one. End-to-end latency ranged from 3.45 s to
  24.63 s; the slow sample spent 24.33 s in xAI. Request sizes ranged from about
  65 KiB to 329 KiB. Non-xAI work stayed below 552 ms, so provider time dominated.
- At 40 active analyses, those observed latency points imply only a theoretical
  roughly 4.8-10.9 completions/second before other bottlenecks. At the user's
  ten-second assumption, the simpler bound is four/second. Neither is an SLA.
- There were no post-v6.4 5xx responses, app errors, adaptive-pressure events,
  or 429s. This clean but low-volume sample does not establish the load threshold.
- The main and deletion-ledger PostgreSQL services are each Basic-256mb
  instances with 0.1 CPU and 256 MiB RAM. The main database's documented
  connection limit is 100, while the optimized API can open at most 14
  main-database connections plus two ledger connections per process. Connection
  count is not the immediate limit, but the main database's 0.1 CPU makes query
  latency a first-class canary signal.

This snapshot supports a 20-to-40 rollout because actual payloads are smaller
than the tested 512 KiB representative case and memory has substantial margin.
It cannot validate 40 under CPU, Clerk, provider, or database contention because
the observed production concurrency was one.

## Production canary

No production load test should be run without an agreed maintenance window and
test accounts because it would consume real model quota and exercise live
Clerk and database state. Use this rollout instead:

1. Deploy the v6.5 server and v5.9 extension with the defaults listed in README.
   Do not increase the 96 MiB byte budget during this canary.
2. Confirm from the first deployed startup log that all capacity values are active.
   If the production key reports a lower provider limit than the supplied team
   report, lower `XAI_MAX_STARTS_PER_SECOND` before sending canary traffic.
3. Send 10, then 20, then 30, then 40 simultaneous requests from distinct test
   users using representative screenshots. Hold each stage long enough to
   cover several ten-second waves and stop on rising latency, xAI 429s,
   database waits, sustained high CPU, memory above 70% of the instance limit,
   event-loop p99 above 100 ms, or any restart/5xx increase.
4. At 40, verify completed throughput, p95/p99 total time, 429 codes by type,
   `analysis_performance` timing fields, RSS/CPU, DB connections and query
   latency, Clerk errors, xAI 429/5xx rates, quota settlement, and clean
   cancellation during one controlled redeploy.
5. Keep 40 only if the full stage is clean. Otherwise reduce it to the highest
   clean stage. Raising it above 40 requires new production evidence; the
   isolated 80-request result is not sufficient.

The PostgreSQL integration suite must also be run with two disposable test
databases before release. It intentionally remains skipped when
`TEST_DATABASE_URL`, `TEST_DELETION_LEDGER_DATABASE_URL`, and the explicit reset
acknowledgement are absent.
