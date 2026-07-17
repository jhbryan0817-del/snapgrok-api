SnapGrok MCQ Assistant V3.5

What changed from V3.4:
- Fixed the partial-selector cursor issue by forcing crosshair cursor styling onto the page root while the selector is active and actively focusing the selector surface.
- Added a processing status icon that appears after the screenshot has been captured and while the request is being processed.
- Changed the default selected-zone shortcut to Ctrl+Shift+X to avoid Chrome's built-in Ctrl+Shift+B bookmarks-bar shortcut.

Operation rules:
- Full screenshot: Ctrl+Shift+A
- Selected zone: Ctrl+Shift+X
- User may reassign both at chrome://extensions/shortcuts
- One shared instruction
- No notifications
- No pause/shutdown toggle
- New screenshots are ignored until the current answer or error icon resets back to default
- Only imageDataUrl, instruction, and maxWords are sent to the existing server
