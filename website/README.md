# SneakSolve website

The public landing page and Clerk-backed sign-in, sign-up, sign-out, and account
management experience for SneakSolve.

## Routes

- `/` — promotional landing page
- `/account?mode=sign-in` — primary sign-in gateway
- `/account?mode=sign-up` — primary registration gateway
- `/account` — signed-in profile and security settings
- `/sign-in` and `/sign-up` — direct authentication routes

Signed-out visitors see separate **Log in** and **Sign up** actions. Signed-in
visitors see their name and avatar with **Manage account** and **Sign out**.

## Required configuration

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... or pk_live_...
NEXT_PUBLIC_SITE_URL=https://sneaksolve.com
```

The build fails if either value is missing or invalid. A Clerk secret key must
never be placed in the website service.

For local development, set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in
`.env.local`. Only localhost or `127.0.0.1` may use HTTP.

## Commands

```powershell
npm.cmd ci
npm.cmd run test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

## Render settings

- Root directory: `website`
- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Node version: 22 (the repository currently requires 22.13 or newer)

The website sets CSP, HSTS in production, clickjacking, MIME-sniffing,
referrer, permissions, and cross-origin isolation headers through Next.js.
