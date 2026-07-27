# SneakSolve website security boundary

## Current boundary

The website is a public marketing site and a Clerk client. It contains only
public `NEXT_PUBLIC_*` configuration. Clerk owns the browser session and its
account-management UI. The website has no first-party mutation endpoint and no
authority to grant plans, quotas, model access, or referrals.

The account UI is a presentation boundary, not an authorization boundary.
Future privileged operations must verify Clerk authentication on the API
server. A visible signed-in component or a user ID supplied by the browser is
never sufficient authorization.

## Required billing architecture

Keep Lemon Squeezy secrets and subscription authority in the existing API
service, not in this website:

1. The website requests a short-lived Clerk session token and sends it to an
   authenticated API endpoint.
2. The API derives the Clerk user ID from the verified token. It must not trust
   a browser-supplied user ID, plan, price, variant ID, quota, or model name.
3. The API maps a small internal plan identifier to an allowlisted Lemon
   Squeezy variant ID and creates the checkout or customer-portal URL.
4. The website may navigate only to the exact HTTPS URL returned by that
   endpoint. Do not accept arbitrary `return_to`, checkout, or portal URLs.
5. Lemon Squeezy webhooks terminate at a separate public API route. That route
   verifies the signature against the raw request bytes before parsing JSON,
   records the provider event ID idempotently, rejects replayed/conflicting
   events, and updates subscription state transactionally.
6. Webhooks do not use browser Origin checks or Clerk sessions. Checkout and
   portal creation do use Clerk authentication and normal browser-origin
   protections.
7. The protected analysis API, not this website, remains the final authority
   for entitlement, quota consumption, reset windows, and model selection.

Never expose a Clerk secret key, Lemon Squeezy API key, webhook signing secret,
xAI key, database credential, or provider payload in a `NEXT_PUBLIC_*`
variable, client component, redirect URL, analytics event, or log.

## Deployment rules

- Install from the committed lockfile with `npm ci --ignore-scripts`.
- Run `npm run check` before deployment.
- Deploy only the source tree. Do not upload `.env*`, `.next`, `node_modules`,
  caches, logs, browser profiles, cookies, tokens, or build archives.
- Keep the canonical production values from `.env.example`; the production
  build intentionally fails closed if the site or Clerk host is changed.
- Re-run `npm audit` and the full check whenever dependencies change.
