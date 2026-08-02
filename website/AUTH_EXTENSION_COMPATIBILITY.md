# v5.1 authentication and extension compatibility

## Comparison outcome

The attached website retained the same core production boundaries as the
verified v5.1 website:

- `ClerkProvider` requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- Production rejects a non-`pk_live_` Publishable Key.
- Clerk routes remain `/sign-in` and `/sign-up`.
- Sign-out still redirects to `/`.
- `NEXT_PUBLIC_CLERK_FRONTEND_API_URL` remains required by the CSP.
- The production Clerk Frontend API stays `https://clerk.sneaksolve.com`.
- The canonical site stays `https://www.sneaksolve.com`.
- No Clerk Secret Key or xAI key is used by the website.

The website sends authenticated plan, checkout, and server-side cancellation
requests to the Render API. It does not send screenshot-analysis requests. The Chrome
extension independently reads the Clerk Sync Host session, obtains its
short-lived token, and calls the protected analysis API. Billing integration
does not change that capture flow. Extension v5.1.7 additionally answers one
origin-restricted, read-only installation ping so the account page can
distinguish installed from missing.

## Attached-folder differences corrected

The supplied design had changed successful sign-in and sign-up redirects from
`/account` to `/`. It also routed the header buttons through standalone
`/sign-in` and `/sign-up` pages.

The current website preserves the verified authentication contract:

- Log in: `/account?mode=sign-in`
- Sign up: `/account?mode=sign-up`
- Successful authentication: `/account`
- Signed-in menu: Manage account and Sign out

This keeps account management visible after authentication and preserves the
same production Clerk cookie that the extension observes.

## Unchanged systems

- SneakSolve screenshot and answer behavior
- Render API v5.5.0
- Chrome extension ID and origin allowlists
- Clerk Native API setting
- Clerk production DNS and Frontend API
- xAI model selection and rate limiting

The pricing page can request a server-created Whop sandbox checkout, but the website
has no subscription, quota, model-routing, webhook, or entitlement authority.
