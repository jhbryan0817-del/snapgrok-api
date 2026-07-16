SNAPGROK MCQ ASSISTANT — CHROME EXTENSION V2
Version 0.3.0

PURPOSE
This folder is the Chrome extension only. Keep the existing snapgrok-api_v2
repository deployed on Render. No server-code change is required for this build.

WORKFLOW
1. The user writes one instruction in the extension popup.
2. Full-screen shortcut: captures the visible area of the active Chrome tab.
3. Select-zone shortcut: lets the user drag around part of the visible tab, then
   crops the screenshot to that area.
4. The extension sends only these JSON fields to the current server:
     - imageDataUrl
     - instruction (user instruction + the built-in A-F output rule)
     - maxWords=20 (required by the current server validation)
5. A-E display the five answer icons.
6. F displays the Inconclusive icon.
7. Capture, network, server, and processing failures display the System Error icon.
8. Every result icon remains for 5 seconds and then resets to the default icon.

DEFAULT SHORTCUTS
- Ctrl+Shift+O (Command+Shift+O on macOS): Full-screen
- Ctrl+Shift+L (Command+Shift+L on macOS): Select Zone

Chrome can leave a suggested shortcut unassigned when it conflicts with another
browser, extension, or operating-system shortcut. Click either shortcut box in
the popup to open chrome://extensions/shortcuts and assign a different key.

QUESTION-OVERLAP PREVENTION
From the moment a capture begins until the result icon completes its 5-second
display and resets, additional capture shortcuts are ignored. This applies while
selecting a zone, waiting for Grok, and displaying A-E, Inconclusive, or System
Error.

SELECT-ZONE APPEARANCE
The page is not darkened, tinted, blurred, or contrasted against the selected
area. Only a thin neutral outline marks the rectangle. Press Escape to cancel.

NO NOTIFICATIONS / NO ON-OFF FEATURE
This extension has no notification permission and contains no notification code.
It has no pause, resume, shutdown, or enable/disable control. It remains active
whenever Chrome has the extension enabled.

DATA HANDLING
- Screenshot bytes exist only in temporary JavaScript variables while the request
  is captured, cropped when applicable, and transmitted.
- The extension does not save screenshots or answers in chrome.storage, IndexedDB,
  files, or a database.
- chrome.storage.local stores only the user's written instruction.
- chrome.storage.session stores only temporary workflow state such as whether a
  request is in progress and when the icon should reset. It does not contain a
  screenshot or AI answer text.
- The current snapgrok-api_v2 server processes request content transiently and
  does not write it to persistent storage.

SCREENSHOT BOUNDARY
Chrome's captureVisibleTab API captures the visible content area of the active
Chrome tab. "Full-screen" in this extension therefore means the full visible tab
viewport, not the entire desktop, another application, browser toolbar, or a
full webpage extending below the current scroll position.

SELECT-ZONE RESTRICTIONS
Chrome does not allow scripts to be injected into certain protected browser pages,
including many chrome:// pages. Full-screen capture may still work on some of
those pages, but Select Zone will show the System Error icon when selection cannot
be started.

INSTALL
1. Extract Snapgrok-mcq-extension_v2.zip.
2. Open chrome://extensions.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the extracted Snapgrok-mcq-extension_v2 folder.
6. Pin the extension to the toolbar.
7. Click the icon, add the instruction, and verify both shortcut assignments.

SERVER COMPATIBILITY
The existing snapgrok-api_v2 server already accepts imageDataUrl, instruction,
and maxWords at POST /api/analyze. The extension sends maxWords=20 because the
server currently rejects lower values. The server may keep its unused balance
endpoint; this extension never calls it and contains no account or token UI.
