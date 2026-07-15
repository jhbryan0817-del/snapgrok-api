SNAPGROK MCQ ASSISTANT — EXTENSION-ONLY UPDATE
Version 0.2.0

WHAT CHANGED
- Three configurable shortcuts only.
- No response-window settings and no response popup.
- The active Chrome tab is captured and sent to the existing local backend.
- The extension adds a strict instruction requesting exactly one answer: A, B, C, D, or E.
- The toolbar icon becomes:
    A = red circle
    B = orange circle
    C = yellow circle
    D = green circle
    E = blue circle
- The answer icon remains for 5 seconds, then returns to the black square.
- Ctrl+Shift+Z pauses the extension. Open the popup and click Resume extension to use it again.

INSTALL / UPDATE
1. Keep your existing server unchanged and running at http://127.0.0.1:8787.
2. Extract this ZIP.
3. Open chrome://extensions.
4. Turn on Developer mode.
5. Either:
   a. Remove the previous unpacked SnapGrok extension, then click Load unpacked and select this folder; or
   b. Replace the files inside the old extension folder with these files and click Reload on its Chrome extension card.
6. Pin the extension to Chrome's toolbar. The answer is communicated through the pinned icon.
7. Click the black-square icon, then configure the name and instruction for each shortcut.
8. Open chrome://extensions/shortcuts and confirm the bindings. Chrome may leave a shortcut unassigned if it conflicts with a browser or operating-system shortcut.

DEFAULT SHORTCUTS
- Ctrl+Shift+A: shortcut 1
- Ctrl+Shift+B: shortcut 2
- Ctrl+Shift+C: shortcut 3
- Ctrl+Shift+Z: pause extension

IMPORTANT SERVER COMPATIBILITY NOTE
The previous server requires maxWords to be at least 20. This extension sends maxWords=20 to remain compatible, but also sends a strict instruction demanding one character only. The extension then extracts the returned A-E choice and ignores any extra text.

IMPORTANT MOCK-MODE NOTE
The old server's MOCK_XAI=true response is a paragraph rather than A-E. For real icon testing, set MOCK_XAI=false in server/.env, add a valid xAI key, and restart the server.

SCREENSHOT SCOPE
A Chrome extension can automatically capture the visible area of the active Chrome tab. It does not silently capture the complete Windows desktop or another application.

DATA RETENTION
This MCQ extension always sends deleteAfterUse=true, so the existing local server will not retain the screenshot/response for each MCQ request.
