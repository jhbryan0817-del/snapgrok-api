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
