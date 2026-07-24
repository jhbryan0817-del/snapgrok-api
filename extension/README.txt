SNEAKSOLVE MCQ ASSISTANT V5.0.0

LIVE CONFIGURATION
- Website and account management: https://sneaksolve.com
- Clerk: the supplied development instance (replace for production Clerk)
- API: https://snapgrok-api.onrender.com

AUTHENTICATION AND LOGOUT ENFORCEMENT
- Opening the popup shows an account prompt when no Clerk session is available.
- Sign-in, sign-up, sign-out, and account management open on sneaksolve.com.
- The Manifest V3 service worker requests a short-lived Clerk session token.
- Every analysis request sends that token in the Authorization header.
- The API verifies the token, exact extension origin, and current Clerk session
  before beginning analysis and once more before returning a result.
- A server HTTP 401 causes one forced token refresh and one retry. A session
  that remains inactive is rejected with a clear sign-in message.

SECURITY AND PRIVACY CHANGES IN V5
- The area selector is no longer installed on every website at page load. It is
  injected only after the user invokes the selected-area keyboard shortcut.
- The broad `tabs` permission and localhost host permissions were removed.
- The extension can contact only the Render API, current Clerk Frontend API,
  and sneaksolve.com.
- Screenshots and instructions are not written to extension storage.
- Existing internal SNAPGROK_* message names and storage keys remain unchanged
  so upgrading does not erase settings or break the authentication bundle.

PRESERVED FUNCTIONALITY
- Full visible-tab and selected-zone capture workflows.
- Long server requests continue in a transient offscreen document.
- Processing, single-answer, multiple-answer, inconclusive, and error icons.
- Four-second result display and one-operation-at-a-time locking.
- No notifications and no screenshot or answer storage.

BEFORE CHROME WEB STORE SUBMISSION
Rebuild the Clerk authentication bundle/config with the production publishable
key and production Frontend API/sync host. Keep the same Chrome Web Store key
so the extension ID stays stable. Update the extension origin in Clerk, Render
ALLOWED_ORIGINS, and Render CLERK_AUTHORIZED_PARTIES.
