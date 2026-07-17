# SnapGrok MCQ V3.4 architecture

## V1-derived listening path

The service worker registers `chrome.commands.onCommand` synchronously at top level. There is no asynchronous initialization before listener registration, no global promise queue, no offscreen document, and no dynamic command registration.

Full capture follows the V1 sequence directly:

`command -> active tab query -> captureVisibleTab -> fetch -> parse -> icon -> reset`

## Selected-zone addition

A small static content script is present on ordinary HTTP/HTTPS pages and waits for a start message. It does nothing until the selected-zone shortcut is received. If an already-open tab does not yet contain the listener, the service worker performs one fallback injection and retries the start message.

After the user selects a rectangle, the selector removes itself before requesting capture. The service worker captures the visible tab and crops it with `OffscreenCanvas`; it does not create or coordinate a separate offscreen extension document.

## State and overlap lock

One finite session-storage record describes the current operation. A separate icon-state record exists only during the five-second result display. The default icon is restored before both records are removed.

## Service-worker lifetime boundary

The backend fetch has a 27-second client timeout. Chrome documents a 30-second response limit for fetches in extension service workers. A timed-out request therefore becomes a visible system error rather than leaving an uncertain operation behind.

## Server contract

The request body remains:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "instruction": "user instruction plus the built-in A-F rule",
  "maxWords": 20
}
```


## V3.6 selector activation

The selector uses a transparent modal `<dialog>` in the browser top layer rather than relying only on z-index. A normal `<div>` inside the dialog hosts the closed Shadow DOM; Shadow DOM is not attached directly to the dialog. A small DOM-rendered crosshair replaces the native cursor while selection is active. The selector acknowledges readiness only after two animation frames and a top-layer hit-test.
