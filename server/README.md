# SneakSolve API v5.0.3

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
- JSON request size, image data-URL type, and instruction length are bounded.
- Disconnecting the extension aborts the in-flight xAI call and releases the
  user's concurrency slot.
- The xAI and Clerk secret keys stay server-side.
- Screenshots, prompts, answers, page URLs, and tokens are not written to logs,
  files, or a database. xAI requests set `store: false`.

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

`CLERK_JWT_KEY` is optional but recommended for local signature verification.
It does not replace `CLERK_SECRET_KEY`, because live session status requires the
Backend API. See `.env.example` for limits and optional balance settings.

When `REQUIRE_PRODUCTION_CLERK=true`, startup rejects `sk_test_` or `pk_test_`
credentials. This prevents a production Render deployment from silently
returning to the development Clerk instance.

## Render settings

- Root directory: `server`
- Runtime: Node
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/health`
- Node version: 20.9 or newer

## Local checks

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd start
```

The analysis request and response shapes remain compatible with V3.9. The
required addition is `Authorization: Bearer <Clerk session token>`.
