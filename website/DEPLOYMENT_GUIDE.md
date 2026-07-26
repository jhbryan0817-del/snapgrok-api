# SneakSolve website v5.3.0 deployment

## Scope

Deploy only the website package. Do not redeploy or edit:

- the Render API service;
- the Chrome extension;
- the Clerk production instance;
- DNS records; or
- existing environment-variable values.

Pricing is visual only. It does not enforce allowances, select xAI models,
charge customers, or assign subscriptions yet.

## 1. Replace the website source

1. Back up the current `website` directory or create a Git branch.
2. Extract `SneakSolve-website-v5.3.0.zip`.
3. Copy every extracted item into the repository's existing `website`
   directory.
4. Replace matching files, including `package.json` and `package-lock.json`.
5. Confirm:

   ```text
   website/app/page.tsx
   website/app/pricing/page.tsx
   website/app/affiliate/page.tsx
   website/app/privacy/page.tsx
   website/app/site-footer.tsx
   website/app/account/page.tsx
   website/public/sneaksolve-how-it-works.png
   website/package.json
   website/package-lock.json
   ```

6. Confirm `website/package.json` reports version `5.3.0`.
7. Commit and push to the branch watched by the Render website service.

Do not upload `.env.local`, `node_modules`, `.next`, Clerk Secret Keys, xAI
keys, cookies, or browser tokens.

## 2. Keep the Render website configuration

```text
Root Directory: website
Build Command: npm ci && npm run build
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
2. Confirm `npm ci` uses the committed lockfile.
3. Confirm the Next.js build lists `/`, `/pricing`, `/affiliate`, `/privacy`,
   `/account`, `/sign-in`, and `/sign-up`.
4. Wait for the service to become **Live**.

## 4. Production checks

1. Open `https://www.sneaksolve.com` in a private window.
2. Confirm the top navigation shows Pricing, Affiliate Marketing, and Privacy
   Policy, without Home, Why SneakSolve, or Account tabs.
3. Confirm the new illustration, compact statistics, feature cards, and
   two-item privacy list appear.
4. Open `/pricing` and confirm Plan Upgrades, all three plans, Ultra marked
   Most Popular, and the billing-launch notice.
5. Open `/affiliate` and confirm the page says the planned program is not
   active yet.
6. Open `/privacy` and confirm it is clearly labeled as a working draft.
7. Confirm the global footer appears on each route.
8. Select Log in and confirm the Clerk form appears on `/account`.
9. Sign in and confirm the account page appears.
10. Open the profile menu and confirm Manage account and Sign out work.
11. Open the Chrome extension and confirm it recognizes the website session.
12. Sign out and confirm the extension returns to its signed-out state.

## Rollback

Restore the previous website commit and redeploy the website service. No server,
extension, Clerk, or DNS rollback is required.
