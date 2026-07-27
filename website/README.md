# SneakSolve website v5.5.0

The existing SneakSolve marketing, authentication, pricing, and account design
with tester-only Lemon Squeezy billing controls.

## Billing client boundary

- Clerk remains the browser session authority.
- The website obtains a short-lived Clerk token and calls only the SneakSolve
  API billing routes.
- The API, not the website, selects variants, plans, quotas, models, and
  entitlements.
- Checkout and customer-portal destinations must be HTTPS Lemon Squeezy URLs
  returned by the authenticated API.
- No Lemon Squeezy, Clerk, xAI, or PostgreSQL secret is present in the website.

## Public environment

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuc25lYWtzb2x2ZS5jb20k
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
NEXT_PUBLIC_API_URL=https://snapgrok-api.onrender.com
```

Production builds fail closed if a canonical hostname changes. The CSP allows
connections only to the pinned API and Clerk infrastructure.

## Local checks

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
```

Use Node 22.13.1. See the root `DEPLOYMENT_GUIDE.md`; deploy API v5.3.0 before
this website.

