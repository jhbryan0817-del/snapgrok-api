# Chrome Web Store declarations reviewed — 12 October 2026

Google's data-handling policy includes local processing and information handled by the connected backend. These declarations describe existing behavior; they do not grant Chrome permissions. The uploaded extension has activeTab, scripting, storage, alarms and one API host permission, without history, geolocation or payment-card permissions.

| Category | Declare | Actual handling |
|---|---|---|
| Personally identifiable information | Yes | Account email and user identifiers in authentication/pairing and cached account state. |
| Health information | No | No health integrations or intended health-record input; users are instructed to avoid sensitive personal content. |
| Financial and payment information | Yes | Optional paid access uses Whop; the connected backend stores minimum transaction/payment/refund/dispute and subscription state. The extension does not collect card numbers. |
| Authentication information | Yes | Rotating device access/refresh credentials, pairing and authenticated account sessions. |
| Personal communications | No | No mailbox/chat integration or intended personal-message collection. Incidental screenshot content remains website content. |
| Location | Yes | The API uses a validated socket/proxy IP address as an ingress rate-limit key. No GPS access, geolocation lookup or location profiling. |
| Web history | Yes | Selected capture reads the current tab URL locally to reject protected pages. It does not request chrome.history, retain visited-page lists or send that URL in analysis requests. Trusted website-message origin/URL checks also run locally. |
| User activity | Yes | The injected selector keeps the latest pointer coordinates in memory while the script remains loaded, and uses drag coordinates for capture geometry. Operation identifiers/timestamps and quota usage counts support requested analysis. No behavioral advertising or browsing analytics. |
| Website content | Yes | User-requested screenshots and optional instructions go to Zenaian and xAI to produce proposed answers. Captured content is not a persistent application database record. |

Financial/payment and Location were omitted from the earlier draft and have been corrected. Payment processing occurs on the connected website/backend, and IP handling is used for security rather than geographic features. Google's form explicitly lists IP addresses under Location and transactions/payment history under Financial and payment information.

Implementation references: `extension/service-worker.js` (`handleCommand`, `isBrowserRestrictedPage`), `extension/zone-selector.js` (`lastPointer` and selection geometry), `extension/auth.js` (device sessions/account cache), `server/src/server.js` (`requestClientKey`, ingress admission and account endpoints), `server/src/whop-billing-store.js` (minimum payment records). The public privacy policy already describes subscription records; its security section now explicitly covers IP rate limiting and local URL/pointer handling.

Other reviewed fields: Education category; English language; existing short description/version 1.0.0; free installation with optional paid subscriptions; Public distribution/all supported regions; no mature content; no remote executable code; narrowly scoped permission justifications; privacy/homepage/support links; three Limited Use certifications (no sale, no unrelated use, no creditworthiness/lending use). These match the reviewed source. No runtime interface change is requested.

The current UI and disclosure flow are retained at the user's request, with review feedback to be addressed later. Accurate data declarations and a completed draft do not predict Google's approval.

References: [Google user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
