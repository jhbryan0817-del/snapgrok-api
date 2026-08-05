# Zenaian website v6.8.0 deployment

This release changes only the website. Do not redeploy the API or extension.

Render:

```text
Root Directory: website
Build Command: npm ci --ignore-scripts && npm run build
Start Command: npm start
Node version: 22.13.1
```

Public environment:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuemVuYWlhbi5jb20k
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.zenaian.com
NEXT_PUBLIC_SITE_URL=https://www.zenaian.com
NEXT_PUBLIC_API_URL=https://snapgrok-api.onrender.com
NEXT_PUBLIC_EXTENSION_ID=jjgjlopdpefphgappfmkkkpiknpnoijb
```

Never add `CLERK_SECRET_KEY`, `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`,
`DATABASE_URL`, or `XAI_API_KEY`.

API v5.7.0 and extension v5.3.0 remain compatible and unchanged.

After deployment, verify sign-in/sign-out and extension synchronization remain
unchanged. In live billing mode every signed-in user receives
server-authoritative Free, Plus, or Ultra usage. The account shows independent
Plus and Ultra renewal controls, while pricing permits a separate full-price
Ultra purchase from Plus and prevents an in-period Ultra-to-Plus purchase.

After deployment, hard-refresh the public site. Verify the landing page,
Privacy, Terms, pricing, sign-in, and account routes. `Contact Us` should open
an email composer for `sneaksolve@gmail.com`; `/contact` should return 404.
