# Zenaian website v6.10.0 deployment

This is a website-only release. It remains compatible with the currently
deployed API v5.8.1 and extension v5.3.0, so neither needs to be redeployed.

Render website settings:

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
`DATABASE_URL`, or `XAI_API_KEY` to the website service.

After deployment, hard-refresh the site and verify the Explore features jump,
the Careers and Use Cases pages, the local-time account greeting, English
reset/expiry dates, Free pricing checkout, and paid renewal cancellation
notice. Extension v5.3.0 does not need to be repackaged or reinstalled.
