# Zenaian website v6.1.0

The Zenaian marketing, authentication, pricing, and account website with
production Whop billing controls and live account-readiness status.

## Extension readiness

The account page combines server-authoritative remaining usage with a secure
connection to extension v5.2.0. The canonical website may detect the extension,
request a random pairing nonce, deliver a one-use server grant, and clear local
auth on sign-out. It cannot request screenshots, credentials, settings, custom
context, or capture actions.

## Billing client boundary

- Clerk remains the website session authority; Clerk credentials never enter
  the extension.
- The account page creates a nonce-bound pairing grant through the API for the
  exact configured extension ID. The extension exchanges it for a rotating
  server-issued device session bound to its Chrome origin.
- The website obtains a short-lived Clerk token and calls only the Zenaian
  API billing routes.
- The API, not the website, selects provider plans, quotas, models, and
  entitlements.
- Checkout destinations must be exact HTTPS Whop URLs returned by the
  authenticated API. Cancellation and renewal reactivation are authenticated,
  plan-scoped server-side operations.
- No Whop, Clerk, xAI, or PostgreSQL secret is present in the website.

## Public environment

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuc25lYWtzb2x2ZS5jb20k
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
NEXT_PUBLIC_API_URL=https://snapgrok-api.onrender.com
NEXT_PUBLIC_EXTENSION_ID=jjgjlopdpefphgappfmkkkpiknpnoijb
```

Production builds fail closed if a canonical hostname changes. The CSP allows
connections only to the pinned API and Clerk infrastructure.

## Local checks

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run check
```

Use Node 22.13.1. See the root `DEPLOYMENT_GUIDE.md`; deploy API v5.6.0 before
website v5.9.0. Extension v5.2.2 remains unchanged.
