# SneakSolve website changelog

## v5.6.0 - account readiness and plan-aware pricing

- Updated the landing copy, marketing counts, and answer-state section order.
- Removed Affiliate Marketing from public navigation and removed its route.
- Replaced the three account overview cards with a live readiness indicator
  based on the installed production extension and server-reported usage.
- Added current-plan, upgrade, and switch labels to the pricing cards without
  enabling subscription changes.
- Constrained the embedded Clerk profile width while retaining Clerk's full
  profile and security controls.
- Added extension v5.1.6 compatibility for the read-only installation ping.
- No screenshot, xAI, quota, checkout, webhook, or entitlement behavior changed.

## v5.5.1 - account-page stability

- Fixed the billing reset-date formatter that crashed the signed-in account
  page immediately after plan status loaded.
- Added a safe ISO fallback so locale-specific date formatting can never take
  down account management.
- Isolated the plan widget behind an error boundary so an unexpected billing
  display failure cannot take down Clerk profile management.
- Added a regression test for the browser-supported `Intl.DateTimeFormat`
  option combination.
- No server, extension, Clerk synchronization, Lemon Squeezy checkout, or
  website design behavior changed.

## v5.5.0 - Lemon Squeezy test rollout

- Added authenticated plan and quota status to the existing account design.
- Added server-created Plus and Ultra test checkout from the existing pricing
  cards for designated billing tester accounts.
- Added secure customer-portal navigation for paid tester subscriptions.
- Added fail-closed production API-origin validation and CSP connectivity for
  `https://snapgrok-api.onrender.com`.
- Kept all Lemon Squeezy secrets and entitlement decisions on the API server.
- Updated the privacy draft for test billing metadata and service providers.

## v5.4.2 - security hardening

- Added a unique CSP nonce to every dynamic document response and removed
  `unsafe-inline` from `script-src`.
- Added fail-closed production origin and Clerk instance checks.
- Added no-store and no-index controls for account and authentication routes.
- Removed inactive template authentication, example API, Cloudflare, Vite,
  Sites, and Drizzle scaffolding.
- Added security, secret, Clerk consistency, and billing-boundary tests.
- Kept the complete website design and account flow unchanged.

## v5.4.1 - landing-page illustration

## Landing-page illustration

- Restored the original clean workflow illustration without numbered markers
  inside the depicted computer monitor.
- Retained the numbered three-step legend below the illustration.
- Retained the current red error icon in How the icons work.

## Preserved behavior

- No authentication, server, extension, Clerk, DNS, pricing, or billing
  behavior was changed.

# SneakSolve website v5.4.0

## Landing-page visuals

- Added matching purple 1, 2, and 3 markers inside the workflow
  illustration beside the shortcut, question, and magnified result.
- Replaced the black error-state example in How the icons work with the
  extension's current red error icon.

## Preserved behavior

- No authentication, server, extension, Clerk, DNS, pricing, or billing
  behavior was changed.

# SneakSolve website v5.3.0

## Navigation and footer

- Removed the Home and Why SneakSolve header tabs.
- Added Pricing, Affiliate Marketing, and Privacy Policy navigation.
- Added a compact global footer with core links and accurate xAI trademark
  attribution.

## New public pages

- Added `/affiliate` as a clearly labeled preview of the planned 20% referral
  commission program.
- Added `/privacy` as a product-aligned working draft covering the current
  Clerk, Render, extension, and xAI data flow.

## Pricing

- Renamed the pricing heading to Plan Upgrades.
- Made Ultra the highlighted Most Popular plan.
- Replaced the inaccurate Plus comparison with Everything offered in the Free
  plan and More flexible usage.

## Preserved behavior

- No authentication, server, extension, Clerk, DNS, or billing integration was
  changed.

# SneakSolve website v5.2.0

## Design

- Adopted the supplied light lavender, glass-surface visual system.
- Added an original physics-question workflow illustration.
- Compact statistics, new workflow features, and a three-plan pricing page.

## Authentication contract

- Preserved the v5.1 production Clerk provider and Frontend API configuration.
- Restored `/account` as the post-authentication destination.
- Preserved the signed-in account menu, Manage account action, and sign-out.

## Security and dependencies

- Preserved CSP, origin validation, production-key validation, and headers.
- Updated PostCSS and brace-expansion to patched versions.
- Replaced the vulnerable/incompatible legacy Next ESLint plugin tree with a
  TypeScript ESLint configuration.
- Final dependency audit reports zero known vulnerabilities.
