# SnapGrok V3.9 architecture

1. The service worker receives the shortcut.
2. It captures the full visible tab or crops the selected zone.
3. It displays the processing icon and stores only operation metadata in session storage.
4. It creates a transient offscreen document and sends the screenshot request to that document.
5. The offscreen document calls the unchanged `/api/analyze` endpoint and can wait up to 120 seconds.
6. It sends the completed backend payload or error back to the service worker.
7. The service worker parses the payload and displays the result for four seconds.
8. The default icon is restored before the overlap lock is removed.
9. The offscreen document is closed after completion.

The screenshot and instruction are never written to extension storage.
