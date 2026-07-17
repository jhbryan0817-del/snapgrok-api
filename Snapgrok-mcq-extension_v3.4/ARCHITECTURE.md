# SnapGrok MCQ V3.4 architecture

## Design basis

The full-screen path deliberately follows the reliable V1 structure:

1. A top-level `chrome.commands.onCommand` listener receives the command.
2. The service worker queries the active tab.
3. `chrome.tabs.captureVisibleTab()` captures it directly.
4. The service worker sends one request directly to the existing Render endpoint.
5. The returned letter is parsed.
6. The toolbar icon displays the result for five seconds and returns to default.

There is no global promise queue, offscreen document, notification pipeline, balance request, pause state, or multi-controller workflow.

## Full visible-tab path

`shortcut -> service-worker.js -> captureVisibleTab -> /api/analyze -> result icon -> default icon -> unlock`

## Selected-zone path

`shortcut -> service-worker.js -> existing content-selector.js listener -> user drag -> service-worker.js -> captureVisibleTab -> OffscreenCanvas crop -> /api/analyze -> result icon -> default icon -> unlock`

The selector content script is declared in `manifest.json` and loaded at `document_start` on ordinary HTTP and HTTPS pages. Dynamic injection is used only once as a fallback for a tab that was already open before installation.

## Overlap prevention

One operation record is stored in `chrome.storage.session`. A new shortcut is ignored while that record exists and remains valid.

The lock covers selection, capture, cropping, analysis, and the complete five-second result period. Reset order is:

1. restore the default icon;
2. restore the default toolbar title;
3. remove the operation record.

## Data handling

Persistent storage contains only the user instruction. Screenshots and answers remain in memory for the active request and are not written to extension storage.

## Error representation

Every technical failure displays the system-error icon. A valid `F` response alone displays the inconclusive icon. Escape is a deliberate cancellation and restores the default icon without displaying an error.
