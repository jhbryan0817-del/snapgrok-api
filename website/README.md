# SneakSolve website v5.4.2

Render-ready redesign of the SneakSolve marketing and account website.

## What changed in v5.4.2

- Replaced the inline-script CSP allowance with a unique per-request nonce and
  `strict-dynamic`.
- Added no-store and no-index controls to account and authentication routes.
- Added fail-closed production validation for the site, Clerk host, and
  publishable-key pairing.
- Removed inactive template authentication, example mutation, Cloudflare,
  Vite, Sites, and Drizzle scaffolding from this Render-only application.
- Preserved every visual-design, page-copy, image, navigation, pricing, footer,
  account, and extension-synchronization file.

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
- `/affiliate` - planned affiliate-program preview
- `/privacy` - working privacy-policy draft
- `/account` - Clerk sign-in or signed-in account management
- `/account?mode=sign-up` - Clerk registration
- `/sign-in` and `/sign-up` - compatibility routes returning to `/account`

## Local validation

```bash
npm ci --ignore-scripts
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
Build Command: npm ci --ignore-scripts && npm run check
Start Command: npm start
```

See `DEPLOYMENT_GUIDE.md` for the complete replacement and rollback process.
