# SneakSolve website v5.5.1 deployment

Deploy the root release guide's API and webhook steps first.

Render:

```text
Root Directory: website
Build Command: npm ci --ignore-scripts && npm run build
Start Command: npm start
Node version: 22.13.1
```

Public environment:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuc25lYWtzb2x2ZS5jb20k
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.sneaksolve.com
NEXT_PUBLIC_SITE_URL=https://www.sneaksolve.com
NEXT_PUBLIC_API_URL=https://snapgrok-api.onrender.com
```

Never add `CLERK_SECRET_KEY`, `LEMONSQUEEZY_API_KEY`,
`LEMONSQUEEZY_WEBHOOK_SECRET`, `DATABASE_URL`, or `XAI_API_KEY`.

After deployment, verify sign-in/sign-out and extension synchronization remain
unchanged. A designated tester should see plan usage on `/account` and should
be able to open a test checkout from `/pricing`. A non-tester should receive a
controlled tester-only checkout message and retain legacy extension access.

The full deployment, end-to-end test, and rollback procedure is in the root
`DEPLOYMENT_GUIDE.md`.
