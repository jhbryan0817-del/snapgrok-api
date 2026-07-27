# SneakSolve v5.1.4 acceptance tests

1. Confirm normal responses under 27 seconds still work.
2. Simulate a 35-60 second backend response and confirm the processing icon remains visible and the answer eventually appears.
3. Confirm a response exceeding 120 seconds becomes a system error.
4. Confirm repeated shortcuts are ignored while processing.
5. Confirm a single-answer result resets after four seconds and the next
   request works.
6. Confirm a multiple-answer result resets after six seconds.
7. Leave custom context empty and confirm both full and selected-zone capture
   work without an instruction error.
8. Confirm unlabeled, numeric-labelled, and Roman-numeral-labelled five-choice
   questions are all returned as positional A-E by displayed choice order.
9. Confirm both full and selected-zone capture work.
10. Confirm no notification permission or notification calls exist.
11. While signed out, keep the popup open and sign in on the website. Confirm
   the popup changes to Ready; then reopen it and confirm it remains Ready.
12. Immediately run a full capture after sign-in. Confirm no transient authentication error appears.
13. Sign out on the website, immediately reopen the popup, and confirm it shows the sign-in view without reloading the extension.
14. Immediately try both shortcuts after sign-out. Confirm neither captures or calls xAI.
15. Start an analysis and sign out before it completes. Confirm the extension cancels the operation and does not display an answer.
16. Present a valid JWT for an ended or revoked Clerk session to the API. Confirm the API returns HTTP 401 with `AUTH_SESSION_INACTIVE`.
17. Make Clerk's active-session lookup unavailable. Confirm the API fails closed with HTTP 503 rather than calling xAI.
18. Abort an analysis request from the extension. Confirm the API propagates the abort to the downstream xAI call and releases the concurrency slot.
19. Inspect the manifest and confirm there is no broad `content_scripts` entry or `tabs` permission.
20. Invoke selected-area capture on a normal HTTPS page and confirm the selector is injected only after the shortcut.
21. Click the popup sign-in button and confirm it opens
    `https://www.sneaksolve.com/account` rather than localhost.
    Confirm this still works without granting website host access.
22. Sign out while xAI is already processing and confirm the API withholds the completed result with HTTP 401.
23. In the service-worker console, confirm `SnapGrokAuth.hasSyncCookie()` is
    true when signed in and false immediately after website sign-out.
24. Confirm `SnapGrokAuthConfig` contains only `pk_live_`,
    `https://clerk.sneaksolve.com`, `https://www.sneaksolve.com`, and the Render
    API—never `pk_test_`, `accounts.dev`, or localhost.
25. In the service-worker console, run
    `await chrome.declarativeNetRequest.getDynamicRules()`. Confirm rule `50502`
    removes only `Origin`, lists only `post`, uses the runtime extension ID as
    its initiator, and filters the production Clerk host plus `_is_native=1`.
26. Run
    `Boolean(await SnapGrokAuth.getSessionToken({ forceRefresh: true }))`.
    Confirm it returns `true` without
    `origin_authorization_headers_conflict`. Do not print or copy the token.
27. Confirm `chrome.storage.local` is set to `TRUSTED_CONTEXTS`, then verify
    the popup and context editor still load and save custom context.
27. Immediately capture a test question. Confirm the Render request reaches
    `/api/analyze` with a non-empty Bearer token and no longer returns
    `AUTH_REQUIRED`.
28. Confirm the native token metadata reports `azp` absent, then confirm the
    exact extension-origin request succeeds while the wrong-origin server test
    returns `AUTH_TOKEN_PARTY_INVALID`.
29. Confirm selected-area capture works on Google Search without a false
    active-page-layer error.
30. On `chrome://extensions`, confirm selected-area capture shows the controlled
    browser-owned-page error and full-screen capture remains available.
31. Confirm the Toolbar results preview is ordered: Single answer, Multiple
    answers, Processing, Inconclusive, Error.
32. Confirm the preview and actual toolbar use the same amber tile with a white
    question mark for inconclusive results and the same red tile with a white
    exclamation mark for errors.
