# Zenaian website v6.14.1 deployment

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

After deployment, hard-refresh the site and verify the hero's synchronized
eight-second shortcut, capture, Z, Processing, and B timeline; the processing-first Receive your answers panel; the A-and-C hover
tooltip, both shortcut selectors, the local-only context Save confirmation,
the two-row manual flowchart, the enlarged SWE Marathon graph, and one supporting page.
Then smoke-test sign-in, expand and collapse Your account details, and verify
pricing status. Review `WHOP_CHECKOUT_TERMS.md` and `LEGAL_REVIEW_NOTES.md`
before copying terms into Whop. Extension v5.3.0 does not need to be
repackaged or reinstalled.
