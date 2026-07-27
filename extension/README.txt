SNEAKSOLVE MCQ ASSISTANT V5.1.5

PRODUCTION CONFIGURATION
- Website/account management: https://www.sneaksolve.com
- Clerk Frontend API and Sync Host: https://clerk.sneaksolve.com
- Clerk Publishable Key: pk_live_Y2xlcmsuc25lYWtzb2x2ZS5jb20k
- Render API: https://snapgrok-api.onrender.com
- Expected unpacked ID: pjfanaeopegobidkbpnlmeegmkmnabmk

AUTHENTICATION
- The production Clerk __client cookie is the session source of truth.
- A missing Sync Host cookie immediately blocks capture and cached tokens.
- Popup account visibility follows Clerk's hydrated user/session.
- Capture obtains a short-lived session token, and a server 401 triggers one
  forced refresh and one retry.
- A least-privilege Chrome request rule makes Clerk's native production token
  POST unambiguous by removing Chrome's automatic Origin header from that one
  request class.
- The API verifies the token, binds a native token without azp to the exact
  extension origin, and checks the live Clerk session before work and again
  before returning an answer.

SECURITY AND PRIVACY
- Only the Render API and production Clerk host are in host_permissions.
  Opening the canonical website does not require host access.
- Saved custom context is restricted to trusted extension contexts.
- The zone selector is injected only after its shortcut is invoked.
- Screenshots, instructions, tokens, and answers are not persisted.
- There is no broad tabs permission, remote code, or notification permission.
- The request rule is limited to POST requests initiated by this extension,
  sent to the production Clerk host, and marked by Clerk as native.

CAPTURE BEHAVIOR
- Every capture sends a unique operation ID so the API can reserve, consume,
  or refund exactly one quota unit without trusting extension-side counters.
- Plan-limit and temporary billing-verification errors use the existing error
  icon and expose a specific explanation in the toolbar tooltip.
- Custom context is optional. With an empty field, the API applies the complete
  default SneakSolve instruction.
- Every question is mapped by displayed choice order: first A, then B, C, D,
  and E, regardless of the labels printed beside those choices.
- Single answers and system states display for four seconds. Multiple-answer
  results display for six seconds.
- Selected-area capture works on normal web pages. Chrome blocks script
  injection into chrome:// pages, the Chrome Web Store, and other extensions;
  use full-screen capture on those browser-owned pages.

INSTALLATION
Copy these files over the same folder already loaded in Chrome, then select
Reload at chrome://extensions. Confirm version 5.1.5 and the expected ID above.
Loading a different folder can change an unpacked extension ID and requires
updating Clerk and both Render origin allowlists.

See the root DEPLOYMENT_GUIDE.md before deploying or testing.
