# Zenaian website v6.9.0 deployment

Deploy API v5.8.0 before this website so the payment-history endpoint and
single-plan checkout policy are available when the new UI becomes public.

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

After deployment, hard-refresh the site and verify the favicon, EB Garamond
hero slogan, Free pricing checkout, paid renewal cancellation notice,
reactivation from Account, and the Payment history dropdown. Extension v5.3.0
does not need to be repackaged or reinstalled.
