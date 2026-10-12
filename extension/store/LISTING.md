# Chrome Web Store listing copy — Zenaian 1.0.0

## Name

Zenaian MCQ Assistant

## Short description

Capture visible or selected multiple-choice questions and receive proposed answers through the Chrome extension icon.

## Detailed description — paste into Store listing

Zenaian is a compact study companion for reviewing multiple-choice practice questions. Capture the visible webpage or select just the question you want to review, and receive proposed answer labels through the Chrome extension icon. Keep your attention on the question while using a quick second opinion to support practice and revision.

Use keyboard shortcuts for visible-page or selected-region capture, and add a custom instruction when more context would help. The icon shows processing and answer states, while the popup explains the controls and results. A Zenaian account and internet connection are required; a free daily allowance and optional paid plans are available on our website. Verify proposed answers against your own reasoning.

Website: https://www.zenaian.com
Plans: https://www.zenaian.com/pricing
Privacy: https://www.zenaian.com/privacy
Terms: https://www.zenaian.com/terms
Support: support@zenaian.com

## Listing fields

| Field | Value |
|---|---|
| Language | English |
| Homepage | https://www.zenaian.com |
| Support | https://www.zenaian.com and support@zenaian.com |
| Privacy policy | https://www.zenaian.com/privacy |
| Category | Education |
| Pricing declaration | Free installation with optional paid subscriptions on the website. Answer the dashboard's paid-feature questions accordingly. |

## Privacy practices — paste into purpose and justification fields

**Single purpose:** Zenaian analyzes a user-requested screenshot of one multiple-choice question and displays proposed AI answer labels through the Chrome extension icon. It supports visible-tab or selected-region capture and an optional instruction.

**activeTab:** Temporary access to the active tab only after the user invokes a capture shortcut, to capture the visible question. The extension does not request persistent access to all websites.

**scripting:** Runs the packaged selection overlay after the user invokes selected capture. No remote JavaScript is loaded or executed.

**storage:** Saves preferences, optional instruction, rotating device credentials, cached account status and temporary operation state locally. Captured images are not persisted.

**alarms:** Resumes polling for user-requested analysis and expires pending processing indicators when the service worker sleeps. Alarms do not initiate captures.

**Host access — https://snapgrok-api.onrender.com/*:** Sends authenticated pairing, account-status and user-requested analysis requests to Zenaian's backend over HTTPS. Captured images and instructions are processed by the backend and xAI solely for the requested answer.

**Remote code:** No. Executable scripts and styles are packaged locally. Remote AI responses are answer data, not executable code.

**Data categories:** Declare Personally identifiable information, Authentication information, Financial and payment information, Location, Web history, User activity, and Website content. Financial/payment covers the connected service's minimum Whop transaction and subscription records, without card numbers. Location covers IP addresses used for ingress rate limiting, without GPS or location profiling. Web history covers the local current-tab URL check, without history API access, URL transmission in analysis requests, or a retained browsing history. User activity covers local pointer coordinates for the selection overlay and necessary usage/operation counts. Health information and Personal communications are not intended inputs or requested integrations; screenshots can contain incidental content, and the UI tells users to avoid sensitive personal information and credentials. See DATA-USAGE-REVIEW.md for the complete category audit.

The Limited Use certifications should reflect the actual implementation: no sale of user data, no use beyond the disclosed purpose and necessary operation/security, and no use for creditworthiness/lending decisions. These certifications do not establish that the product's separate disclosure flow satisfies Google's requirements.

## Private reviewer instructions — paste into Test instructions

Install the submitted extension, pin its icon, open the popup and choose “Log in or sign up.” Sign in to the dedicated test account supplied separately in the dashboard. The account page pairs the installed extension. Reopen the popup.

Open an ordinary HTTPS practice page showing one synthetic multiple-choice question. Use Ctrl+Shift+Z to capture the visible page. Use Ctrl+Shift+X for selected capture, then drag over the question. macOS uses Command instead of Ctrl. Wait for processing to finish, then hover over the extension icon to see the proposed AI-generated answer label. The popup's legend explains the icon states. Use Edit to change shortcuts or the optional custom instruction.

The free allowance is five questions per UTC day; completed inconclusive responses also use allowance. No paid purchase is required. Captures require internet/backend availability. Selected capture cannot inject an overlay on browser-owned/protected pages. Please contact support@zenaian.com for access or pairing problems.

Supply an ordinary test account with a working login and enough allowance in the private dashboard field. Do not publish credentials or place them in the ZIP/repository. Do not disable authentication or bypass quotas for review.

## Artwork and screenshots

Prepared brand artwork:
• zenaian-store-icon-128.png — existing extension icon, 128×128 PNG.
• zenaian-store-tile-440x280.png — required small promotional tile.
• zenaian-store-marquee-1400x560.png — optional marquee/banner.

The promotional artwork illustrates the brand; it is not a screenshot. Keep the current packaged icon to preserve the extension's interface. Google's square-icon guide recommends 96×96 artwork within a 128×128 transparent canvas; the existing icon fills more of that canvas. This is an artwork-guideline consideration, not evidence that a code change guarantees approval.

One genuine screenshot is prepared: zenaian-store-screenshot-support-1280x800.png. It shows the actual installed Store-ID extension signed in as support@zenaian.com. The popup pixels were cropped from a native Chrome capture and resized onto a plain light canvas; no interface, account state or text was fabricated.

Do not upload a mocked QA preview as an actual product screenshot. Avoid personal email addresses, real assessment material and claims of guaranteed accuracy or speed.

## Disclosure review consideration — current UI retained

The current signup agreement links only to Terms and Privacy. The original extension UI is restored, including its existing AI/privacy footer, without a new consent screen. Google says a prominent disclosure cannot exist only in legal documents or the Store listing and must precede a specific affirmative agreement within the product UI. The user has chosen to submit the existing flow and respond to reviewer feedback. Its compliance remains a review uncertainty; no additional consent interface is requested. This is separate from legal enforceability of the Terms and from Chrome's browser permission prompt.

Suggested text for a future prominent notice alongside the existing signup agreement (prepared only; not inserted into the interface):

“When you use a capture shortcut, your screenshot and optional instruction are sent over HTTPS to Zenaian and xAI to generate a proposed AI answer. Capture runs only when you request it. Zenaian does not persist captured content, and production inference requires xAI Zero Data Retention. AI answers can be wrong. Do not capture identifiable sensitive information or credentials. I agree to this processing and the Terms of Service and Privacy Policy.”

That text alone is not sufficient: users must see it and affirmatively agree before the relevant handling, and existing users must be covered too. The placement, acceptance record and capture authorization must be verified together. No claim is made that the current flow meets that requirement or that legal-document updates guarantee approval.

## Official references

• [Disclosure and consent FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
• [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
• [Image requirements](https://developer.chrome.com/docs/webstore/images)
• [First upload](https://developer.chrome.com/docs/webstore/publish)
• [Extension identity](https://developer.chrome.com/docs/extensions/reference/manifest/key)
