# Zenaian website changelog

## v6.16.4 - Deployment health endpoint

- Adds a dedicated no-store `/api/health` route for Render website health checks.

## v6.16.3 - Cleaner footer navigation

- Removes the vertical separators between footer navigation links while
  preserving the dividers between desktop business-information entries.

## v6.16.2 - Right-aligned footer navigation and fuller disclosures

- Moves the footer navigation into the top-right space opposite the Zenaian
  wordmark and removes the promotional footer sentence.
- Adds placeholders for the representative, business phone and email, and the
  mail-order report number and filing authority alongside the existing
  business identity fields.

## v6.16.1 - Search identity and business footer

- Replaces the padded search-result artwork with an edge-fitted circular
  favicon and publishes matching application and Open Graph site-name signals.
- Adds homepage `WebSite` structured data that identifies the preferred site
  name as **Zenaian** for future search-engine recrawls.
- Rebuilds the global footer with clearer navigation, business-information
  rows, and placeholders for the business name, contact point, address, and ID.

## v6.16.0 - User-specific data summary

- Restores **View my data** as a concise summary built from the signed-in
  user's exact authenticated JSON export rather than generic Zenaian privacy
  information.
- Reuses the same fetched export for the on-page summary and complete download,
  so the two views cannot silently describe different records.
- Renames **Download JSON** to **Download file** and places it directly beside
  **View my data** on desktop and mobile.
- Keeps screenshots, prompts, questions, generated answers, credentials, card
  data, and other non-retained content out of the summary and export history.

## v6.15.2 - Visible reverification and bounded deletion exit

- Keeps Clerk's identity-reverification dialog above Zenaian's account-deletion
  confirmation so a recent-authentication challenge is visible and can retry
  the deletion request instead of leaving the button on “Submitting…”.
- Starts a bounded hard-navigation fallback as soon as deletion succeeds so an
  invalidated Clerk session cannot stall extension cleanup or sign-out before
  the public deletion-receipt page opens.

## v6.15.1 - Account deletion recovery

- Fixes CSP nonce crashes for missing public assets and other app-rendered 404
  routes by keeping them inside the nonce proxy boundary.
- Uses the API's configured recent-authentication window for Clerk
  re-verification instead of a hard-coded ten-minute hint.
- Explicitly clears the extension and Clerk frontend sessions after a deletion
  request and redirects to a public, locally stored deletion receipt.
- Removes the misleading human-readable “View my data” summary while retaining
  the authenticated JSON export.
- Defers object-URL cleanup briefly so JSON downloads remain reliable in
  WebKit-based browsers.

## v6.15.0 - Privacy controls and approved legal documents

- Publishes the approved Website Privacy Policy and Terms of Service while
  preserving the operator, registration, CPO, effective-date, and support
  placeholders that must be completed before launch.
- Adds authenticated account privacy controls for a human-readable data view,
  JSON export, and idempotent account deletion through the Zenaian API.
- Requires four explicit deletion acknowledgements and typed `DELETE`, and
  clearly explains immediate access loss, renewal cancellation, statutory
  retention, backup aging, and irreversibility without asking for a reason.
- Adds a clear 19+ Terms and Privacy representation to both website signup
  paths without collecting a date of birth.
- Adds no analytics, behavioral telemetry, or consent banner and leaves Clerk,
  Whop, pricing, quota, and extension-pairing behavior unchanged.

## v6.14.1 - Interface refinement

- Removes the dormant default icon from the Explore readout, fills the toolbar
  frame with the default Z, and eliminates the remaining reset-frame flash.
- Narrows the workflow comparison, enlarges both question demonstrations,
  adds next-question controls, and makes the manual AI tab more realistic.
- Adds a subtle time motif behind the test-preparation comparison.
- Uses a name-free local greeting and state-specific readiness badge widths on
  the account page without changing pairing or entitlement logic.
- Rebuilds Careers as a concise Seoul-based global education SaaS hiring page.
- Leaves Clerk, Whop, API, quota, extension pairing, and security boundaries
  unchanged from v6.14.0.

## v6.14.0 - Stable exploration, interactive comparison, and privacy priority

- Removes the visual capsule from the hero illustration disclaimer while
  preserving its synchronized appearance window.
- Keeps both Explore icon containers geometrically fixed and pre-renders the
  toolbar artwork, eliminating the one-frame size and copy-position shifts.
- Makes the manual comparison user-controlled, enlarges both demonstrations,
  narrows the centered flowchart, and adds a compact shortcut-to-answer cycle.
- Reframes the landing privacy section around Zenaian's transient processing,
  a subtle disposal illustration, and an xAI retention disclosure.
- Replaces the generic account heading with a local-time greeting and aligns a
  wider single-line readiness badge beside it on desktop.
- Leaves Clerk, Whop, API, quota, extension pairing, and security boundaries
  unchanged from v6.13.0.

## v6.13.0 - Stable icon exploration and workflow motion

- Shows the hero illustration disclaimer only after the shortcut preview has
  left, keeping it visible through Processing and answer B before hiding it
  when the default Z returns.
- Removes the enlarged default Z from the answer-state explanation and adds a
  clear invitation to hover over the five state icons.
- Moves hover reset to the icon group boundary and removes hover translation,
  preventing border-position oscillation while retaining mouse, keyboard, and
  touch interaction.
- Narrows and centers the manual-versus-Zenaian flowchart, adding a repeating
  manual tab-switching illustration on the left and a fast capture-to-answer
  illustration on the right.
- Aligns the Privacy Policy and Terms headers with the shared editorial header
  used by the other public pages.
- Restores the public environment template and secret-safe `.gitignore` while
  leaving Clerk, API, extension pairing, Whop, entitlement, and security logic
  unchanged.
- Updates the transitive `nanoid` dependency to 3.3.18, clearing the current
  production dependency audit without changing application behavior.

## v6.12.0 - Synchronized hero, collapsible profile, and legal drafts

- Replaces the conflicting desktop hover and reduced-motion rules with one
  synchronized eight-second hero cycle: Z and shortcut/capture sequence for
  three seconds, Processing for 2.5 seconds, and answer B for 2.5 seconds.
- Keeps the shortcut presses and capture sweep visible on pointer devices and
  browsers that report a reduced-motion preference.
- Converts Your account details into an initially collapsed, accessible
  disclosure while retaining Clerk's complete profile and security interface.
- Updates the Privacy Policy and Terms of Service to cover the current Chrome
  capture, local extension settings, device sessions, xAI processing, Whop
  subscription lifecycle, PostgreSQL records, no-trial policy, constrained
  no-refund policy, and acceptable-use rules.
- Adds separate Plus and Ultra Whop checkout terms plus a pre-launch legal
  review checklist. These remain working drafts requiring qualified counsel.
- Leaves the API, extension, Clerk pairing, Whop webhook, quota, model,
  entitlement, and billing implementation unchanged.

## v6.11.1 - Reliable hero states and benchmark focus

- Fixes the hero extension icon so idle, processing, and answer states each
  display for about four seconds even when the visitor prefers reduced motion.
  The reduced-motion version changes opacity only and avoids scaling effects.
- Increases the description-to-demo spacing by about 50% and trims roughly 60%
  of the empty space below the final answer while keeping the shortcut preview
  inside the browser frame.
- Removes the SWE Bench Pro efficiency chart and enlarges the SWE Marathon
  comparison for clearer reading.
- Leaves authentication, account, Whop billing, API, entitlement, and extension
  behavior unchanged.

## v6.11.0 - Interactive product preview and page alignment

- Tightens the hero demonstration, updates its biology question, and cycles
  the extension icon through idle, processing, and answer states every four
  seconds while respecting reduced-motion preferences.
- Opens Receive your answers in the processing state, gives each state a
  smooth white icon surface, and reveals the example answers A and C when the
  multiple-answer toolbar icon is hovered or focused.
- Adds local-only shortcut selectors and a non-persistent custom-instruction
  editor. These previews do not contact the API, alter extension settings, or
  store visitor input.
- Rebuilds the manual workflow as a two-line flowchart and adds sourced,
  xAI-reported real-world software-engineering benchmark charts for Grok 4.5.
- Aligns Pricing, Use Cases, Careers, Terms, and Privacy with the landing
  page's serif hero typography, spacing, card radii, and shadow treatment.
- Updates the transitive development dependency `js-yaml` to 4.3.1 to resolve
  CVE-2026-59870. No API, extension, authentication, billing, or entitlement
  behavior changes in this website-only release.

## v6.10.0 - Navigation, editorial pages, and account clarity

- Corrects Explore features so it targets Receive your answers.
- Adds responsive Use Cases and Careers pages to the global header and footer.
- Uses the browser's local time for morning, afternoon, or evening greetings.
- Formats account and plan-change dates in English while retaining the user's
  local time zone.
- Shortens and widens the no-questions status badge for a cleaner desktop line.
- Removes the redundant Open account action from cancellation-success notices.
  Plus-to-Ultra cancellation instead offers Create account, which uses the same
  secure extension-session cleanup as normal sign-out before opening sign-in.

## v6.9.0 - Single-plan billing and account payment history

- Replaced the earlier simultaneous Plus/Ultra checkout behavior with one
  paid plan per Clerk account. Every paid plan change now confirms and cancels
  renewal, preserves access through the paid expiry, and explains when the
  next plan can be purchased.
- Added an authenticated, lazy-loaded Payment history dropdown for paid,
  disputed, and refunded Whop payments without exposing full provider payloads
  or payment-method data.
- Added a compact Zenaian favicon while leaving the global header wordmark
  unchanged, and changed only the landing slogan to EB Garamond.
- Restored the public environment template and secret-safe `.gitignore` that
  were absent from the repository snapshot.

## v6.8.0 - Website content, legal, and account layout update

- Doubled the desktop header-to-hero trust-pill spacing, introduced an
  editorial serif hero headline, and darkened the Grok 4.5 panel slightly.
- Added Law and Anatomy to rapid review and expanded the manual workflow to
  Screenshot, Switch Screen, Paste and Ask, Confirm, and Return while reducing
  the Zenaian path to Capture and Confirm.
- Replaced the Terms placeholder with a product-aligned working draft that
  expressly prohibits cheating and other unauthorized use, and expanded the
  Privacy Policy to cover extension sessions, AI processing, Whop billing,
  retention, security, children, international processing, and user choices.
- Removed the Contact route and changed global Contact Us links to direct
  email links for `sneaksolve@gmail.com`.
- Removed the duplicate paid-subscription summary rows while retaining secure
  server-authoritative cancel and reactivate actions directly below Plan &
  Usage. Multiple concurrent Plus and Ultra subscriptions remain independently
  manageable when both exist.
- Restored the website environment example and secret-safe `.gitignore` that
  were absent from the v6.7.0 repository snapshot.
- Updated the narrow `brace-expansion` build-tool override to patched version
  5.0.9 after the August 3, 2026 denial-of-service advisory for 5.0.8.

## v6.7.0 - Focused hero and frontier-model section

- Removed the active-user and questions-solved statistics strip and moved its
  subscriber proof into the hero's quiet note.
- Raised the hero closer to the header, refined its headline typography, and
  balanced the spacing immediately above the product illustration.
- Replaced the product illustration with a precise edit that removes only the
  three blue shortcut-key borders and the existing outer corner artifacts.
- Added a coherent Grok 4.5 section after the memorization section with an
  independent-product disclaimer for xAI and SpaceX.

## v6.6.1 - Hero rollback and spacing correction

- Removed the scattered hero badges and all hero-image interaction overlays.
- Restored the original product illustration and supplied PNG wordmark.
- Clipped only the original illustration's dark corner artifacts with the
  surrounding frame, without altering the artwork itself.
- Tightened the space above the illustration and added a subtle divider between
  the hero headline and supporting copy.

## v6.6.0 - Interactive hero and rapid-review section

- Added restrained answer-option, answer-state, and magnifier interactions to
  the existing product illustration.
- Removed the blue shortcut-key outlines and outer black edge artifacts from a
  revised, non-destructive copy of the hero artwork.
- Rebuilt the header and footer wordmark in the website typeface while keeping
  the blue `ai` treatment and the three-dot `a` mark.
- Added compact answer-state badges around the hero and a concise
  memorization-based test-preparation section below the feature panel.
- Tightened and rounded the three requested calls to action without changing
  their destinations or behavior.

## v6.5.0 - Complete production-domain migration

- Completed the public Zenaian rebrand without changing billing, quota, or
  extension-pairing behavior.
- Pinned production website and Clerk origins to `www.zenaian.com` and
  `clerk.zenaian.com` consistently across the provider, CSP, metadata, and
  build-time validation.
- Restored the tracked environment example and secret-safe `.gitignore` that
  were missing from the redesigned GitHub package.
- Paired with API v5.7.0 and extension v5.3.0.

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
