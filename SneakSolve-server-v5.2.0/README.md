# SneakSolve API v5.2.0

Render-ready API with Clerk authentication, exact-origin CORS, per-user abuse
controls, downstream cancellation, and no persistent request-content storage.

## Authentication boundary

- `/api/analyze` and `/api/balance` require a Clerk session token.
- Clerk validates the token signature, timing claims, production instance, and
  identity claims.
- Browser-minted tokens validate `azp` through Clerk `authorizedParties`.
- Native Chrome tokens have no `azp` because Clerk mints them from an
  `Authorization`-only request. They are accepted only when the API request
  originates from the exact configured `chrome-extension://...` party.
- The API asks Clerk's Backend API for the current session state before work.
- The API checks the session again after xAI work and before returning a result,
  so signing out during an analysis withholds that result.
- Clerk outages fail closed with HTTP 503; inactive sessions receive HTTP 401.
- `ALLOWED_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` must list the exact
  `chrome-extension://...` origin. CORS alone is defense-in-depth, not identity.

## Request and data protections

- Authentication occurs before the screenshot body is read.
- Missing, malformed, oversized, or duplicated security headers are rejected
  before a Clerk network call.
- Clerk calls, request bodies, HTTP headers, total requests, and xAI responses
  have explicit time and size bounds.
- JSON request size, image signatures, image data-URL type, instruction length,
  and shortcut-name length are bounded.
- Custom context is optional. The API always applies its default MCQ prompt,
  mapping the first through fifth displayed choices to A through E regardless
  of the labels printed in the image.
- Disconnecting the extension aborts the in-flight xAI call and releases the
  user's concurrency slot.
- The xAI and Clerk secret keys stay server-side.
- Screenshots, prompts, answers, page URLs, and tokens are not written to logs,
  files, or a database. xAI requests set `store: false`.
- Provider error details are converted to stable API codes and are not returned
  to the extension.

## Abuse controls versus future subscription quotas

The current per-user and global fixed-window controls are admission/abuse
guards. They are held in memory inside one Node process, reset on restart, and
do not coordinate across multiple Render instances. They must never be used as
the Free/Plus/Ultra source of truth.

The global default is deliberately a coarse 3,000-request-per-minute ceiling,
not a customer quota. It limits authentication floods while avoiding a low
application-wide threshold that a remote client could cheaply exhaust. Put a
trusted edge rate limiter in front of the API before substantially increasing
traffic; do not derive client IPs from arbitrary forwarded headers in this app.

`createSneakSolveServer()` accepts a server-side `resolveAnalysisAccess` hook.
Its returned model is checked against `ALLOWED_XAI_MODELS`; request fields can
never choose a model. During Lemon Squeezy integration, replace the default
hook with a database-backed entitlement lookup. Add a separate atomic usage
reservation transaction immediately after request validation and before the
xAI call. That transaction must:

1. lock or atomically update the Clerk user's usage row;
2. enforce the current entitlement and reset boundary;
3. reserve one request with a unique request ID;
4. select the model from a server-owned plan map;
5. settle the reservation idempotently after the provider outcome.

Webhook processing must update entitlements separately and idempotently. A
webhook payload must never directly increment user quota without signature,
event-ID, product/variant, status, and Clerk-user mapping validation.

## Required Render environment variables

```text
XAI_API_KEY=...
CLERK_SECRET_KEY=sk_live_... (Render only)
CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuc25lYWtzb2x2ZS5jb20k
REQUIRE_PRODUCTION_CLERK=true
ALLOWED_ORIGINS=chrome-extension://pjfanaeopegobidkbpnlmeegmkmnabmk
CLERK_AUTHORIZED_PARTIES=chrome-extension://pjfanaeopegobidkbpnlmeegmkmnabmk
REQUIRE_ALLOWED_ORIGIN=true
```

`CLERK_JWT_KEY` is optional. Leave it blank unless you deliberately maintain a
pinned public key and rotate it with Clerk. It does not replace
`CLERK_SECRET_KEY`, because live session status requires the Backend API. See
`.env.example` for limits and optional balance settings.

When `REQUIRE_PRODUCTION_CLERK=true`, startup rejects `sk_test_` or `pk_test_`
credentials. This prevents a production Render deployment from silently
returning to the development Clerk instance.

Security-sensitive booleans and numeric limits are parsed strictly. A typo now
stops startup instead of silently disabling a control. Production Clerk mode
also rejects `MOCK_XAI=true`, `REQUIRE_ALLOWED_ORIGIN=false`, and HTTP origins.
See `.env.example` for the global admission, timeout, header, and model
allowlist settings.

## Render settings

- Root directory: `server`
- Runtime: Node
- Build command: `npm ci --ignore-scripts`
- Start command: `npm start`
- Health check path: `/api/health`
- Node version: 22.13.1 (tested; 20.9 or newer is supported)

## Local checks

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
npm.cmd start
```

The `instruction` request field is now optional and may be an empty string.
Authentication still requires `Authorization: Bearer <Clerk session token>`.
