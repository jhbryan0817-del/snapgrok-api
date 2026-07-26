# SneakSolve website v5.3.1

Render-ready SneakSolve marketing and account website.

## Changes in v5.3.1

- Replaced the Inconclusive icon with a white question mark on a yellow rounded-square background.
- Replaced the Error icon with a white exclamation mark on a red rounded-square background.
- Replaced the homepage illustration with a two-step workflow:
  1. Press the shortcut.
  2. Read the icon.
- The example question remains unanswered on the page; answer B appears only in the pinned Chrome extension icon.
- Clerk authentication, account management, security headers, pricing, affiliate, and privacy pages remain unchanged.

## Local validation

```bash
npm ci
npm run test
npm run lint
npm run build
```

Use Node.js 22.13 or newer, below 23.

## Render

Keep the existing settings:

```text
Root Directory: website
Build Command: npm ci && npm run build
Start Command: npm start
```

Keep the existing public environment variables:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
```

Never add a Clerk secret key or xAI API key to this website folder.
