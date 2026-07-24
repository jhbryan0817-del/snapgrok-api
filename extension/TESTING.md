# SneakSolve V5 acceptance tests

1. Confirm normal responses under 27 seconds still work.
2. Simulate a 35-60 second backend response and confirm the processing icon remains visible and the answer eventually appears.
3. Confirm a response exceeding 120 seconds becomes a system error.
4. Confirm repeated shortcuts are ignored while processing.
5. Confirm the result resets after four seconds and the next request works.
6. Confirm both full and selected-zone capture work.
7. Confirm no notification permission or notification calls exist.
8. While signed out, open the popup, sign in on the website, then reopen the popup. Confirm it is ready without reloading the extension.
9. Immediately run a full capture after sign-in. Confirm no transient authentication error appears.
10. Sign out on the website, immediately reopen the popup, and confirm it shows the sign-in view without reloading the extension.
11. Immediately try both shortcuts after sign-out. Confirm neither captures or calls xAI.
12. Start an analysis and sign out before it completes. Confirm the extension cancels the operation and does not display an answer.
13. Present a valid JWT for an ended or revoked Clerk session to the API. Confirm the API returns HTTP 401 with `AUTH_SESSION_INACTIVE`.
14. Make Clerk's active-session lookup unavailable. Confirm the API fails closed with HTTP 503 rather than calling xAI.
15. Abort an analysis request from the extension. Confirm the API propagates the abort to the downstream xAI call and releases the concurrency slot.
16. Inspect the manifest and confirm there is no broad `content_scripts` entry or `tabs` permission.
17. Invoke selected-area capture on a normal HTTPS page and confirm the selector is injected only after the shortcut.
18. Click the popup sign-in button and confirm it opens `https://sneaksolve.com/account` rather than localhost.
19. Sign out while xAI is already processing and confirm the API withholds the completed result with HTTP 401.
