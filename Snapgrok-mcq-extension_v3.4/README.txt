SNAPGROK MCQ ASSISTANT — VERSION 3.4.0

PURPOSE
V3.4 keeps the reliable V1 execution pattern for full-tab capture and adds one reusable, declaratively loaded content script for selected-zone capture.

INSTALLATION
1. Disable or remove every older SnapGrok extension.
2. Extract this ZIP.
3. Open chrome://extensions.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the extracted Snapgrok-mcq-extension_v3.4 folder.
7. Pin SnapGrok to the Chrome toolbar.
8. Click the extension icon and add the shared instruction.
9. Open chrome://extensions/shortcuts and confirm the two shortcuts.
10. Refresh web pages that were already open before the extension was installed.

DEFAULT SHORTCUTS
- Ctrl+Shift+A: capture the full visible Chrome tab.
- Ctrl+Shift+B: display a crosshair and select an area of the visible Chrome tab.

Both shortcuts use the same saved instruction.

RESULT ICONS
- A: red circle
- B: orange circle
- C: yellow circle
- D: green circle
- E: blue circle
- F: red X, meaning inconclusive
- Red plus: system error

The result remains visible for five seconds. New screenshot shortcuts are ignored until the toolbar icon has returned to default.

SELECTED-ZONE CAPTURE
The selection layer is transparent. It does not darken or tint the rest of the webpage. Only a thin neutral rectangle marks the selected area.

Selected-zone capture works on ordinary HTTP and HTTPS webpages. Chrome-controlled pages, Chrome Web Store pages, and some built-in viewers may not permit content scripts. Those cases use the system-error icon.

DATA HANDLING
The extension stores only:
- the user-written instruction in chrome.storage.local;
- temporary operation status and timestamps in chrome.storage.session.

It does not store screenshots or answers. It does not use localStorage, IndexedDB, a database, or files.

The backend request contains only:
- imageDataUrl
- instruction
- maxWords: 20

SERVER
No server-side change is required. The extension continues to use:
https://snapgrok-api.onrender.com/api/analyze

NOT INCLUDED
- no push notifications
- no notification permission
- no pause or shutdown control
- no account, subscription, quota, balance, or token tracking
- no screenshot-retention setting
- no result popup

TROUBLESHOOTING
1. Confirm that only V3.4 is enabled.
2. Confirm the shortcuts at chrome://extensions/shortcuts.
3. Test selected-zone capture on a normal https:// webpage.
4. Refresh tabs that were open before V3.4 was loaded.
5. Press Escape to cancel an active selection.
