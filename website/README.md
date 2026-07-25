# SneakSolve website — restored and corrected

This folder restores the approved SneakSolve landing-page redesign and applies only the requested website changes:

- successful sign-in and sign-up return to `/`
- one global header appears on all website pages
- the header contains Home, Why SneakSolve, Account, and Pricing
- authentication pages use a centered Clerk form with a short welcome line
- the signed-in profile menu renders above the demo and its Manage account / Sign out actions work

The Clerk provider, publishable-key validation, website origin validation, security headers, dependency versions, and extension/backend code are not changed.

## Routes

- `/` — approved redesigned landing page
- `/sign-in` — centered Clerk sign-in
- `/sign-up` — centered Clerk registration
- `/account` — signed-in account settings; signed-out users see Clerk sign-in
- `/account?mode=sign-up` — compatibility registration route

## Uploading

Upload this folder's contents on top of the repository's existing `website` directory. Confirm replacement of matching files. Do not create `website/website/`.

Keep the repository's existing `website/package-lock.json`; dependency versions are unchanged. This ZIP intentionally does not replace the lock file.

## Existing Render values

Keep all existing environment variables unchanged:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
```

## Verification

```bash
npm ci
npm test
npm run lint
npm run build
```

Render settings remain:

- Root directory: `website`
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Node: 22.13 or newer, below 23
