# SneakSolve website v5.5.1 account-page fix

## Root cause

After the authenticated billing request returned, the account page formatted
the quota reset date with this invalid `Intl.DateTimeFormat` combination:

```text
dateStyle + timeStyle + timeZoneName
```

Browsers reject that combination with a `TypeError`. Because it occurred
during React rendering, the exception replaced the account page with the
framework error screen. The delay matched the time required for the billing
status request to finish.

## Changes

- Replaced the invalid shorthand options with explicit year, month, day, hour,
  minute, and time-zone-name fields.
- Added an ISO timestamp fallback if locale formatting is unavailable.
- Wrapped only the billing widget in an error boundary. An unexpected future
  billing display error can no longer take down Clerk profile management.
- Added a regression test.
- Bumped the website from 5.5.0 to 5.5.1.

No server, database, webhook, Lemon Squeezy, Clerk configuration, extension,
pricing, quota, or design changes are included.

## Render deployment

Replace the website source with the `website` directory and deploy the same
Render web service using its existing settings:

```text
Root Directory: website
Build Command: npm ci --ignore-scripts && npm run build
Start Command: npm start
```

Keep all existing website environment variables unchanged:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
NEXT_PUBLIC_API_URL=https://snapgrok-api.onrender.com
NODE_VERSION=22.13.1
```

Do not redeploy the API server or extension for this fix.

After deployment:

1. Open a private/incognito window.
2. Sign in through `https://www.sneaksolve.com/account`.
3. Leave the account page open for at least 15 seconds.
4. Confirm the plan, remaining questions, and next-reset date appear.
5. Confirm Clerk profile/security controls remain usable.
6. Refresh once and repeat the check.
