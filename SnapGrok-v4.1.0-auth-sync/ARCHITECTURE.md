# SnapGrok V4.1 architecture

1. The service worker receives the shortcut and creates a fresh background Clerk client.
2. It requires a current session token before any screenshot is captured.
3. It captures the full visible tab or crops the selected zone.
4. It displays the processing icon and stores only operation metadata in session storage.
5. It creates a transient offscreen document and sends the screenshot request and short-lived token to that document.
6. The offscreen document calls `/api/analyze` and can wait up to 120 seconds.
7. The API verifies the JWT, authorized extension origin, and current Clerk session status before calling xAI.
8. A 401 causes one forced token refresh and one retry. A second 401 ends the operation.
9. It sends the completed backend payload or error back to the service worker.
10. The service worker parses the payload and displays the result for four seconds.
11. The default icon is restored before the overlap lock is removed.
12. The offscreen document is closed after completion.

The service worker also listens for Clerk Sync Host cookie changes. It creates a
fresh Clerk client, broadcasts the new account snapshot to the popup, and aborts
any extension-side selector or request when the user has signed out.

The screenshot and instruction are never written to extension storage.
