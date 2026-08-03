# Zenaian website changelog

## v6.4.0 - Brand treatment rollback

- Restored every visible Zenaian mention to normal text.
- Restored the supplied PNG wordmark in the header, footer, and account loading state.
- Preserved the v6.3 hero sizing, eager image animation, headline, and Get Zenaian action.

## v6.3.0 - Hero and wordmark refinement

- Made the home product image eager-loaded with a dedicated first-load animation.
- Reduced general type sizing and converted the main headline to one desktop line.
- Rebuilt the on-page wordmark in the site font and colored its `ai` segment with the brand blue.
- Applied the same `ai` highlight to every visible Zenaian mention.
- Changed the main call to action to Get Zenaian without altering its destination or behavior.

## v6.2.0 - Navigation and visual consistency

- Fixed logo-to-home navigation by making viewport animation registration route-aware.
- Made reveal animations replay whenever sections re-enter the viewport in either scroll direction.
- Unified every page on one rounded, moderately bold, horizontally expanded sans-serif stack.
- Matched interactive blue accents to the sampled Zenaian logo color, `#0549FD`.
- Reduced the header wordmark and blended the footer wordmark into a clean white footer surface.

## v6.1.0 - Visual refinement

- Fixed the header logo crop so the supplied Zenaian wordmark remains visible at every breakpoint.
- Replaced scroll-scrubbed opacity with one-time viewport reveals so the privacy section stays crisp.
- Reduced the hero image width and tightened the space below the header.
- Shifted prominent typography to a thinner, wider editorial serif treatment.
- Renamed the hero action to Get for free and added restrained ambient and staggered motion.

## v6.0.0 - Zenaian rebrand

- Rebranded all public website surfaces from SneakSolve to Zenaian.
- Replaced the warm purple treatment with a formal black-and-classic-blue visual system.
- Rebuilt the hero into a centered text-over-product layout and added restrained entrance and hover animations.
- Changed the signed-out action to Start for free and added Contact Us and Terms of Service placeholders.
- Retained the existing account, Clerk, billing, API, and extension synchronization contracts.

## v5.9.0 - Whop production subscription lifecycle

- Added independent Plus and Ultra subscription display and plan-scoped
  cancel/reactivate controls.
- Plus members can buy a new Ultra subscription at full price with its own
  period; no conversion, credit, proration, or downgrade flow was added.
- Pricing now distinguishes current, canceled-renewal, separate-Ultra, and
  unavailable Ultra-to-Plus states.
- Account status clearly reports payment holds and reversals while preserving
  the existing Clerk controls and readiness design.
- Paired with API v5.6.0; extension v5.2.2 is unchanged.

## v5.8.0 - Whop sandbox billing foundation

- Replaced Lemon Squeezy test checkout links with server-created Whop sandbox
  checkouts for the fixed Plus and Ultra catalog.
- Replaced the unrestricted provider portal with a server-side
  cancel-at-period-end action, preserving the current no-transfer and
  no-mid-period-plan-change policy.
- Kept plan, quota, model, webhook, and entitlement decisions on the API.
- Preserved the existing design, authentication, extension synchronization,
  screenshot capture, and answer behavior.

## v5.6.1 - answer-state icon polish

- Matched the website inconclusive state to the extension's established
  question-mark icon.
- Reduced the visual footprint of the inconclusive and error states so all
  five answer-state icons appear balanced.
- Changed the Ultra action to use the same neutral button treatment as Plus
  while retaining Ultra's purple "Most Popular" badge.
- Paired with extension v5.1.7, which replaces only the circular processing
  artwork with the website's square processing design.
- No authentication, billing, server, quota, capture, or answer behavior
  changed.

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

# Zenaian website v5.4.0

## Landing-page visuals

- Added matching purple 1, 2, and 3 markers inside the workflow
  illustration beside the shortcut, question, and magnified result.
- Replaced the black error-state example in How the icons work with the
  extension's current red error icon.

## Preserved behavior

- No authentication, server, extension, Clerk, DNS, pricing, or billing
  behavior was changed.

# Zenaian website v5.3.0

## Navigation and footer

- Removed the Home and Why Zenaian header tabs.
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

# Zenaian website v5.2.0

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
