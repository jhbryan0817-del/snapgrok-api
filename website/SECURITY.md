# Zenaian website security boundary

## Current boundary

The website is a public marketing site, Clerk client, and authenticated client
of the Zenaian API billing endpoints. It contains only public
`NEXT_PUBLIC_*` configuration. Clerk owns the website session and its
account-management UI. The website has no authority to grant plans, quotas,
model access, or referrals.

The account UI is a presentation boundary, not an authorization boundary.
Future privileged operations must verify Clerk authentication on the API
server. A visible signed-in component or a user ID supplied by the browser is
never sufficient authorization.

## Extension pairing boundary

The production account page may request a random nonce from the exact extension
ID, authenticate to the API with its Clerk token, and deliver the returned
one-use pairing code to that extension. The API binds the resulting rotating
device session to the Clerk user, live Clerk session, and exact extension
origin. The website never receives the device access or refresh credentials;
the extension never receives a Clerk token or cookie. Sign-out revokes device
sessions before ending the Clerk session and also sends an origin-restricted
local clear message.

## Billing architecture

Keep Whop secrets and membership authority in the existing API
service, not in this website:

1. The website requests a short-lived Clerk session token and sends it to an
   authenticated API endpoint.
2. The API derives the Clerk user ID from the verified token. It must not trust
   a browser-supplied user ID, plan, price, provider ID, quota, or model name.
3. The API maps a small internal plan identifier to allowlisted Whop plan and product IDs and creates the checkout.
4. The website navigates only to an exact, validated HTTPS Whop checkout host
   returned by that endpoint. It does not accept arbitrary redirect URLs.
5. Whop webhooks terminate at a separate public API route. That route
   verifies the signature against the raw request bytes before parsing JSON,
   records the provider event ID idempotently, rejects replayed/conflicting
   events, and updates subscription state transactionally.
6. Webhooks do not use browser Origin checks or Clerk sessions. Checkout and
   cancellation do use Clerk authentication and normal browser-origin
   protections.
7. The protected analysis API, not this website, remains the final authority
   for entitlement, quota consumption, reset windows, and model selection.

Never expose a Clerk secret key, Whop API key, webhook signing secret,
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
