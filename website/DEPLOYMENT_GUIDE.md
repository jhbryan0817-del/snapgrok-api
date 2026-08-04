# Zenaian website v6.6.0 deployment

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
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuemVuYWlhbi5jb20k
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.zenaian.com
NEXT_PUBLIC_SITE_URL=https://www.zenaian.com
NEXT_PUBLIC_API_URL=https://snapgrok-api.onrender.com
NEXT_PUBLIC_EXTENSION_ID=jjgjlopdpefphgappfmkkkpiknpnoijb
```

Never add `CLERK_SECRET_KEY`, `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`,
`DATABASE_URL`, or `XAI_API_KEY`.

Extension behavior is unchanged by the rebrand. Deploy extension v5.3.0 after
the Zenaian website and API origin changes are live.
Earlier extension versions do not expose the read-only installation ping and
will correctly be shown as missing.

After deployment, verify sign-in/sign-out and extension synchronization remain
unchanged. In live billing mode every signed-in user receives
server-authoritative Free, Plus, or Ultra usage. The account shows independent
Plus and Ultra renewal controls, while pricing permits a separate full-price
Ultra purchase from Plus and prevents an in-period Ultra-to-Plus purchase.

The full deployment, end-to-end test, and rollback procedure is in the root
`DEPLOYMENT_GUIDE.md`.
