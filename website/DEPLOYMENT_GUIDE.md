# SneakSolve website v5.8.0 deployment

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
NEXT_PUBLIC_EXTENSION_ID=jjgjlopdpefphgappfmkkkpiknpnoijb
```

Never add `CLERK_SECRET_KEY`, `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`,
`DATABASE_URL`, or `XAI_API_KEY`.

Extension behavior is unchanged in this billing iteration. Keep the currently
deployed extension v5.2.2 while evaluating the account readiness light.
Earlier extension versions do not expose the read-only installation ping and
will correctly be shown as missing.

After deployment, verify sign-in/sign-out and extension synchronization remain
unchanged. A designated tester should see plan usage on `/account`, the green
readiness light when usage remains, and plan-aware labels on `/pricing`. A
non-tester should retain legacy extension access.

The full deployment, end-to-end test, and rollback procedure is in the root
`DEPLOYMENT_GUIDE.md`.
