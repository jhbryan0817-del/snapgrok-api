# SnapGrok V3.8 architecture

1. Chrome command listener receives the full-capture or selected-zone shortcut.
2. The service worker creates a session-only operation lock.
3. Full capture uses captureVisibleTab; selected capture uses the existing top-layer selector and then crops the visible-tab image.
4. The processing icon appears once a screenshot has been captured.
5. The extension sends imageDataUrl, the combined instruction, and maxWords to the unchanged Render endpoint.
6. protocol.js extracts model text and parses strict JSON first, then safe fallback formats.
7. One answer displays a letter icon. Several answers display a count icon and expose exact answers through chrome.action.setTitle.
8. After four seconds the default icon is restored, then the operation lock is removed.

The extension stores only the shared instruction and small session workflow metadata. It does not persist screenshots or answers.


## V3.8.2 response parsing
The service worker passes the complete `/api/analyze` JSON response to `protocol.js`. The protocol parser recursively inspects likely response fields and decodes direct, nested, or double-encoded JSON before applying text fallbacks. This remains compatible with the unchanged server response `{ ok: true, text, model, usage, responseId }`.
