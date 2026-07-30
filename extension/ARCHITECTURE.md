# SneakSolve v5.1.7 architecture

1. The auth bridge installs a dynamic Chrome request rule that removes `Origin`
   only from Clerk-native production token `POST` requests initiated by this
   extension.
2. The auth bridge checks the production Clerk Sync Host cookie and creates a
   fresh background Clerk client.
3. The service worker requires a current session token before any screenshot is
   captured.
4. Full-tab capture uses `activeTab`; selected-area capture injects the selector on demand with `activeTab` plus `scripting`.
5. It displays the processing icon and stores only operation metadata in session storage.
6. It creates a transient offscreen document and sends the screenshot request and short-lived token to that document.
7. The offscreen document calls `/api/analyze` with the operation UUID and can
   wait up to 120 seconds.
8. The API verifies the token, binds a native token without `azp` to the exact
   authorized extension origin, and checks the active Clerk session before xAI
   work.
9. The API atomically reserves one server-side quota unit for the operation,
   consumes it after a successful xAI result, and releases it on technical
   failure.
10. The API checks the active Clerk session again before returning the result, covering logout during analysis.
11. A 401 causes one forced token refresh and one retry. A second 401 ends the operation.
12. The service worker parses the response and displays one-answer and system
    states for four seconds, or multiple-answer results for six seconds.
13. The default icon is restored before the overlap lock is removed.
14. The offscreen document is closed after completion.

The service worker listens for Clerk Sync Host cookie changes, broadcasts new
account state to an open popup, and aborts extension-side work after sign-out.
The API remains the authoritative boundary even if Chrome delivers a cookie
change late.

The production website can send one external
`SNEAKSOLVE_EXTENSION_PING` message. The manifest restricts this connection to
`https://www.sneaksolve.com/*`, and the service worker independently verifies
the sender origin before returning only `{ installed: true, version }`. This
handler cannot access or return screenshots, session tokens, settings,
cookies, account data, or capture controls.

The screenshot is never written to extension storage. Optional custom context
is stored locally as an extension preference; it may be empty. The API always
adds the authoritative default MCQ prompt, mapping the first through fifth
choices to A through E by displayed order regardless of their visible labels.

Selected-area capture injects a transient page-layer selector. Chrome prohibits
injection into browser-owned pages such as `chrome://extensions`, the Chrome
Web Store, and other extensions. Those pages show a controlled error directing
the user to full-screen capture. Normal web pages use the modal selector; a
site-specific `elementFromPoint()` retarget no longer rejects an otherwise
valid full-viewport modal.

The header rule uses `declarativeNetRequestWithHostAccess`, rule ID `50502`,
the runtime extension ID as `initiatorDomains`, the exact production Clerk
Frontend API as `urlFilter`, `post` as its only method, and
`xmlhttprequest` as its only resource type. It cannot modify website or Render
API requests.
