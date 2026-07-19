SNAPGROK MCQ ASSISTANT V4.0.2

V4 AUTHENTICATION
- Opening the popup shows an account prompt when no Clerk session is available.
- Sign-in, sign-up, and account management open on the SnapGrok website.
- The Manifest V3 background worker refreshes a short-lived Clerk session token.
- Every analysis request sends that token to the server in the Authorization header.
- The server verifies the token and the exact Chrome extension origin before calling xAI.

V4.0.1 FIX
- The popup now explicitly loads its plain-JavaScript Clerk client before
  reading the synchronized website session.

V4.0.2 FIX
- The popup now requests account state from Clerk's dedicated background client.
- This avoids loading Clerk's optional UI module inside popup.html and keeps the
  background token source and popup account state consistent.

PRESERVED FROM V3.9
- Full and selected-zone capture workflow.
- Long server requests continue in the transient offscreen extension document.
- Processing, answer, multiple-answer, inconclusive, and error icons.
- Four-second result display.
- No notifications.
- No screenshot or answer storage.
- The question image and existing request fields are sent only after authentication.

DEVELOPMENT DEFAULTS
- Website: http://localhost:3000
- Clerk: the supplied development instance
- API: https://snapgrok-api.onrender.com

Before Web Store submission, rebuild with the production Clerk key, production
Frontend API/sync host, deployed website URL, Render API URL, and the Chrome Web
Store public key. See the included deployment guide.
