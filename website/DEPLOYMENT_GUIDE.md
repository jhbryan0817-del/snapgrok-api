# SneakSolve website v5.4.2 deployment

## Scope

Deploy only the website package. Do not redeploy or edit:

- the Render API service;
- the Chrome extension;
- the Clerk production instance;
- DNS records; or
- existing environment-variable values.

Pricing is visual only. It does not enforce allowances, select xAI models,
charge customers, or assign subscriptions yet.

This release restores the original clean landing-page illustration while
retaining the current red error-state example in How the icons work.

## 1. Replace the website source

1. Back up the current `website` directory or create a Git branch.
2. Extract `SneakSolve-website-v5.4.2.zip`.
3. Copy every extracted item into the repository's existing `website`
   directory.
4. Replace matching files, including `package.json` and `package-lock.json`.
5. Confirm:

   ```text
   website/app/page.tsx
   website/public/sneaksolve-how-it-works.png
   website/public/sneaksolve-icons/result-error.png
   website/package.json
   website/package-lock.json
   ```

6. Confirm `website/package.json` reports version `5.4.2`.
7. Commit and push to the branch watched by the Render website service.

Do not upload `.env`, `.env.local`, `node_modules`, `.next`, logs, Clerk Secret
Keys, xAI keys, cookies, or browser tokens.

## 2. Keep the Render website configuration

```text
Root Directory: website
Build Command: npm ci --ignore-scripts && npm run check
Start Command: npm start
Node version: 22.13 or newer, below 23
```

Keep:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your existing production pk_live_ value
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
```

Do not add `CLERK_SECRET_KEY` or `XAI_API_KEY` to the website service.

## 3. Deploy

1. Trigger **Deploy latest commit** in the Render website service.
2. Confirm `npm ci --ignore-scripts` uses the committed lockfile and the full
   lint, test, and production-build check passes.
3. Confirm the Next.js build lists `/`, `/pricing`, `/affiliate`, `/privacy`,
   `/account`, `/sign-in`, and `/sign-up`.
4. Wait for the service to become **Live**.

## 4. Production checks

1. Open `https://www.sneaksolve.com` in a private window.
2. Confirm the hero uses the original clean illustration without numbered
   markers inside the depicted monitor.
3. Confirm the 1, 2, and 3 workflow legend remains below the illustration.
4. Scroll to How the icons work and confirm Error uses a red tile with a white
   exclamation mark.
5. Confirm the rest of the landing page and all navigation links remain
   unchanged.
6. Select Log in and confirm the Clerk form appears on `/account`.
7. Sign in and confirm the account page appears.
8. Open the Chrome extension and confirm it recognizes the website session.
9. Sign out and confirm the extension returns to its signed-out state.
10. In DevTools Network, inspect the main document and confirm it has a
    nonce-based `Content-Security-Policy`, `X-Frame-Options: DENY`,
    `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
11. Inspect `/account` and confirm `Cache-Control` contains `no-store` and
    `X-Robots-Tag` contains `noindex`.

If the previous illustration is still visible after Render reports Live, use a
hard refresh (`Ctrl+F5`) or open the page in a private window to bypass a cached
public image.

## Rollback

Restore the previous website commit and redeploy the website service. No server,
extension, Clerk, or DNS rollback is required.
