# SneakSolve V5 architecture

1. The service worker receives a user shortcut and creates a fresh background Clerk client.
2. It requires a current session token before any screenshot is captured.
3. Full-tab capture uses `activeTab`; selected-area capture injects the selector on demand with `activeTab` plus `scripting`.
4. It displays the processing icon and stores only operation metadata in session storage.
5. It creates a transient offscreen document and sends the screenshot request and short-lived token to that document.
6. The offscreen document calls `/api/analyze` and can wait up to 120 seconds.
7. The API verifies the token, exact authorized extension origin, and active Clerk session before xAI work.
8. The API checks the active Clerk session again before returning the result, covering logout during analysis.
9. A 401 causes one forced token refresh and one retry. A second 401 ends the operation.
10. The service worker parses the response and displays the toolbar result for four seconds.
11. The default icon is restored before the overlap lock is removed.
12. The offscreen document is closed after completion.

The service worker listens for Clerk Sync Host cookie changes, broadcasts new
account state to an open popup, and aborts extension-side work after sign-out.
The API remains the authoritative boundary even if Chrome delivers a cookie
change late.

The screenshot and instruction are never written to extension storage.
