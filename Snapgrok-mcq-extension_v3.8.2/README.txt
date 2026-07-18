SnapGrok MCQ Assistant V3.8

Key changes
- Robust answer parser for JSON, labelled prose, single answers, and multiple answers.
- One-answer toolbar icons display a lowercase a/b/c/d/e.
- Multiple-answer toolbar icons display a check mark and the number of correct options; hover the icon to see the exact options.
- Inconclusive uses a question mark; system errors use an exclamation mark.
- Result icons display for four seconds.
- Redesigned settings popup and instruction editor.
- Crosshair is white with a black outline.
- Existing processing icon retained.

Shortcuts
- Full visible tab: Ctrl+Shift+A
- Select area: Ctrl+Shift+X
- Reassign at chrome://extensions/shortcuts

Server compatibility
V3.8 uses the existing POST /api/analyze endpoint and sends only imageDataUrl, instruction, and maxWords. No server code changes are required.


V3.8 parser correction (internal version 3.8.2)
- Parses the complete backend payload rather than selecting only one top-level response field.
- Accepts status values such as answer and answered.
- Handles direct JSON, nested JSON, double-encoded JSON, embedded JSON, labelled answers, and multiple-answer arrays.
- The server request and server-side code are unchanged.

V3.8.2 icon update:
- Enlarged all result icon backgrounds and symbols to use more of the Chrome toolbar icon canvas.
- Single-answer letters a-e are substantially larger for better toolbar readability.
- Multi-answer, inconclusive, and error result symbols were enlarged consistently.
- No workflow, parsing, selector, processing, server, or storage behavior changed.
