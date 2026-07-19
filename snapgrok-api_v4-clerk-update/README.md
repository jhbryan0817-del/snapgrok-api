# SnapGrok API V4.0 — Clerk protected, no screenshot storage

This is a complete Render-ready replacement for the current SnapGrok server.

## Render settings

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Root directory: blank when this folder's contents are at the repository root
- Node version: 20.9 or later

## Required environment variables

```text
XAI_API_KEY=...
CLERK_SECRET_KEY=...
CLERK_AUTHORIZED_PARTIES=chrome-extension://YOUR_EXTENSION_ID
```

Keep the existing xAI model and timeout variables.

## Protected routes

- `GET /api/health` — public Render health check
- `GET /api/me` — requires Clerk token
- `GET /api/balance` — requires Clerk token
- `POST /api/analyze` — requires Clerk token

The server verifies authentication before reading the screenshot body.

## Storage behavior

The screenshot and instruction exist transiently in request memory, are sent to xAI with `store: false`, and have their server references cleared after the request. The server does not write request contents to files or a database.
