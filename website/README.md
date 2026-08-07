# Zenaian website v6.12.0

The Zenaian marketing, authentication, pricing, and account website with
production Whop billing controls and live account-readiness status.

The landing-page shortcut and context controls are intentionally local-only
product previews. They do not change extension settings, persist input, or
send requests to the API.

The hero uses one eight-second demonstration timeline: the default Z remains
for three seconds while the shortcut and capture sweep run, Processing remains
for 2.5 seconds, and answer B remains for 2.5 seconds. The account's Clerk
profile controls are available through an initially collapsed disclosure.

`WHOP_CHECKOUT_TERMS.md` contains separate Plus and Ultra text for Whop.
`LEGAL_REVIEW_NOTES.md` records the remaining counsel and launch-market work.

## Extension readiness

The account page combines server-authoritative remaining usage with a secure
connection to extension v5.3.0. The canonical website may detect the extension,
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
- The pricing page never opens a second paid checkout while a paid period is
  active. A plan-change click cancels renewal only after confirmation, keeps
  access through the authoritative expiry, and explains when another plan can
  be purchased.
- The account page loads a sanitized payment history on demand from an
  authenticated website-only API route.
- No Whop, Clerk, xAI, or PostgreSQL secret is present in the website.

## Public environment

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuemVuYWlhbi5jb20k
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.zenaian.com
NEXT_PUBLIC_SITE_URL=https://www.zenaian.com
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

Use Node 22.13.1. The website remains compatible with the currently deployed
API v5.8.1 and extension v5.3.0. Neither needs to be redeployed for this
website-only release.
