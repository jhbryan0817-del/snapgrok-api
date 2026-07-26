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
