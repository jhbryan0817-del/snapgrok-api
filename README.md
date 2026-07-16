# SnapGrok API — Render-ready server

Upload **the contents of this folder** to the root of a private GitHub repository.

## Render Web Service settings

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`

## Required Render environment variables

- `XAI_API_KEY` — your xAI inference API key
- `XAI_MODEL` — keep the value from `.env.example` unless you intentionally change models
- `MOCK_XAI=false`
- `XAI_TIMEOUT_MS=180000`
- `MAX_REQUEST_MB=15`

Do not create or upload a `.env` file to GitHub. Render supplies `PORT` automatically, and the server is already configured to listen on `0.0.0.0`.

Optional balance-display variables are documented in `.env.example`.
