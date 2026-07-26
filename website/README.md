# SneakSolve website v5.2.0

Render-ready redesign of the SneakSolve marketing and account website.

## What changed

- Removed the redundant Account link from the primary navigation.
- Replaced the demo-video placeholder with an original product illustration.
- Rebuilt the usage statistics as a compact horizontal strip.
- Added feature cards for custom capture shortcuts and optional AI context.
- Removed the overlapping Private processing privacy item.
- Added `/pricing` with Free, Plus, and Ultra plan previews.
- Updated the Extension access description on the account page.

## Preserved production behavior

- The required Clerk production Publishable Key and Frontend API origin.
- Website-to-extension session synchronization through Clerk.
- Signed-in profile menu, Manage account, and immediate sign-out.
- Login and registration completion return to `/account`.
- Production CSP and security headers.
- No server or extension source is included or changed.

## Routes

- `/` - redesigned landing page
- `/pricing` - presentation-only plan comparison
- `/account` - Clerk sign-in or signed-in account management
- `/account?mode=sign-up` - Clerk registration
- `/sign-in` and `/sign-up` - compatibility routes returning to `/account`

## Local validation

```bash
npm ci
npm run lint
npm test
npm run build
```

Use Node.js 22.13 or newer, below 23, matching the Render runtime.

## Render

Keep the existing environment variables:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
```

Settings remain:

```text
Root Directory: website
Build Command: npm ci && npm run build
Start Command: npm start
```

See `DEPLOYMENT_GUIDE.md` for the complete replacement and rollback process.
