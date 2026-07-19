# SnapGrok API v4

Render-ready SnapGrok backend with Clerk authentication and no persistent
request-content storage.

## Security model

- `/api/analyze` and `/api/balance` require a valid Clerk session token.
- Clerk validates the token signature and its `azp` claim against the exact
  origins in `CLERK_AUTHORIZED_PARTIES`.
- CORS is restricted to the same exact origin list. Arbitrary Chrome extension
  origins are not accepted.
- The server authenticates before reading the screenshot body, applies a hard
  request-size limit, accepts only base64 JPEG/PNG/WebP images, and limits
  instruction length.
- Per-user request and concurrency limits reduce abuse. They are deliberately
  in-memory and do not persist user activity or request contents.
- The xAI key and Clerk secret remain server-side. Neither belongs in the
  website or extension.
- Screenshots, prompts, answers, page URLs, and token usage are not written to a
  database, filesystem, or application logs. xAI requests use `store: false`.

## Local setup

1. Copy `.env.example` to `.env` and replace the placeholder values.
2. Install with `npm ci`.
3. Run `npm test` and `npm run check`.
4. Start with `npm start`.

The health endpoint is `GET /api/health`.

## Render settings

- Runtime: Node
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/health`
- Root directory: blank
- Node version: 20 or newer

Required Render environment variables:

```text
XAI_API_KEY=...
CLERK_SECRET_KEY=sk_test_... (use sk_live_... in production)
CLERK_PUBLISHABLE_KEY=pk_test_... (use pk_live_... in production)
CLERK_AUTHORIZED_PARTIES=chrome-extension://YOUR_32_CHARACTER_EXTENSION_ID
```

`CLERK_AUTHORIZED_PARTIES` contains complete origins separated by commas. A
bare extension ID is not valid. Add a website origin only if the website will
call these protected API routes directly.

`CLERK_JWT_KEY` is optional. When set to the Clerk PEM public key (with literal
`\n` characters if Render stores it on one line), verification is networkless.
If it is empty, Clerk retrieves current signing keys as needed.

See `.env.example` for the optional xAI balance and rate-limit settings.

## API contract

The v3.9 analysis request and response shape is preserved. The only required
v4 addition is the standard header:

```http
Authorization: Bearer <short-lived Clerk session token>
```

Unauthenticated requests receive HTTP 401. Invalid origins receive HTTP 403.
Rate-limited requests receive HTTP 429 with a `Retry-After` header.
