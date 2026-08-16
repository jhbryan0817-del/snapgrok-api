# Zenaian website v6.15.1 deployment

Deploy this website together with API v6.1.0 and the current extension. Deploy and
verify the API first so the account privacy controls never point at an older
export implementation.

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
Then smoke-test sign-in, expand and collapse Your account details, verify
pricing status, complete Clerk reverification when prompted, and test both
Download JSON and account deletion with a disposable test account. Confirm the
deletion receipt signs Clerk out and signed-out navigation returns. Request a
missing asset such as `/favicon.ico` and confirm its 404 retains a CSP nonce
without a server-render crash. A server failure includes a safe error code and
request reference that can be matched to Render logs. Review
`WHOP_CHECKOUT_TERMS.md` and `LEGAL_REVIEW_NOTES.md` before copying terms into
Whop.
