SNAPGROK MCQ ASSISTANT V3.9

MAIN CHANGE
- V3.8.2 aborted the extension-side fetch after 27 seconds.
- Chrome may also terminate a Manifest V3 service-worker fetch when a response takes more than about 30 seconds to arrive.
- V3.9 performs only the long server request in a transient offscreen extension document.
- The request can now wait up to 120 seconds for the existing Render/xAI server.
- The service worker remains responsible for shortcuts, screenshots, cropping, parsing, result icons, and the operation lock.

UNCHANGED
- Existing snapgrok-api_v2 server.
- Full and selected-zone capture workflow.
- Processing, answer, multiple-answer, inconclusive, and error icons.
- Four-second result display.
- No notifications.
- No screenshot or answer storage.
- Only imageDataUrl, instruction, and maxWords are sent to the server.
