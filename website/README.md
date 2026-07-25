# SneakSolve website redesign

Complete Next.js source for the approved SneakSolve landing-page redesign. The Clerk account and authentication flow, environment-variable validation, route structure, dependency versions, and security headers are retained. The redesign is limited to front-end presentation, responsive styling, assets, and landing-page copy.

## Routes

- `/` — redesigned landing page
- `/account?mode=sign-in` — sign-in gateway
- `/account?mode=sign-up` — registration gateway
- `/account` — signed-in account settings
- `/sign-in` and `/sign-up` — direct authentication routes

## Existing environment values

Keep the same values already configured in Render. For local use, copy `.env.example` to `.env.local` and insert the existing Clerk publishable key.

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
```

For local testing only, use `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

## Uploading over the current repository

Upload this folder's contents on top of the current repository `website` directory rather than deleting the directory first. Keep the existing `website/package-lock.json`; dependency versions are unchanged. See `UPLOAD-NOTES.txt` for the exact steps.

## Local commands

Starting from this ZIP alone:

```bash
npm install
npm test
npm run dev
```

With the existing repository lock file:

```bash
npm ci
npm run check
```

## Render

- Root directory: `website`
- Build command with the existing lock file: `npm ci && npm run build`
- Start command: `npm start`
- Node: 22.13 or newer, below 23

Never commit `.env.local`, Clerk secret keys, API keys, or other secrets.
