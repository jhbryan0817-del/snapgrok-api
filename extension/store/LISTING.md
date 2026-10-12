# Chrome Web Store listing copy — Zenaian 1.0.0

## Name

Zenaian MCQ Assistant

## Short description

Capture visible or selected multiple-choice questions and receive proposed answers through the Chrome extension icon.

## Detailed description — paste into Store listing

Zenaian helps you review multiple-choice practice questions using AI. Capture the visible webpage or select only the question you want to analyze, then read proposed answer labels through the Chrome extension icon.

HOW IT WORKS
• Pin Zenaian to your Chrome toolbar and sign in at www.zenaian.com.
• Use Ctrl+Shift+Z to capture the visible webpage, or Ctrl+Shift+X to select a region. On macOS, use Command instead of Ctrl. You can change shortcuts in Chrome's extension shortcut settings.
• The icon shows processing, a proposed single or multiple answer, an inconclusive result, or an error. Hover over the icon for the AI-generated result label.
• Add an optional custom instruction through the extension popup.

ACCOUNT AND PLANS
A Zenaian account and internet connection are required. The free plan includes five questions per UTC day. Optional paid subscriptions are purchased on the Zenaian website: Plus includes 300 questions per monthly billing period; Ultra includes 500. See www.zenaian.com/pricing for current pricing, models and renewal terms. No paid subscription is required to use the free allowance.

AI AND PRIVACY
Captures occur only when you invoke a capture shortcut. The captured image and optional instruction are sent over HTTPS to the Zenaian API and xAI Grok to generate a proposed answer. Zenaian does not save captured images, instructions, question text or AI answers as persistent application database records; production inference requires xAI Zero Data Retention. Account, authentication, usage and subscription information are processed to operate the service. A current-tab URL check for selected capture happens locally, without sending the URL in the analysis request or building browsing history. Captured content is not sold or used for advertising.

AI answers may be wrong. Verify proposed answers yourself. Use Zenaian only where AI assistance is permitted. Do not submit screenshots containing identifiable sensitive personal information or credentials. Selected capture is unavailable on certain protected browser pages.

PERMISSIONS
activeTab: temporary access to the tab when you invoke capture.
scripting: the locally packaged overlay for selecting a capture region.
storage: local preferences, credentials, cached account status and temporary operation state.
alarms: resume polling and clear expired operation indicators, without starting captures.
API host access: authenticated HTTPS communication with the Zenaian backend.

Disable or uninstall Zenaian through Chrome's extension settings to stop future extension use. This does not cancel a website subscription or delete your Zenaian account; manage those on the account page.

Privacy: https://www.zenaian.com/privacy
Terms: https://www.zenaian.com/terms
Support: support@zenaian.com

Zenaian is an independent product and is not affiliated with or endorsed by xAI or Google. Grok is a trademark of xAI.

## Listing fields

| Field | Value |
|---|---|
| Language | English |
| Homepage | https://www.zenaian.com |
| Support | https://www.zenaian.com/account and support@zenaian.com |
| Privacy policy | https://www.zenaian.com/privacy |
| Category | Choose the closest Education/Study tools or Productivity category available in the dashboard. |
| Pricing declaration | Free installation with optional paid subscriptions on the website. Answer the dashboard's paid-feature questions accordingly. |

## Privacy practices — paste into purpose and justification fields

**Single purpose:** Zenaian analyzes a user-requested screenshot of one multiple-choice question and displays proposed AI answer labels through the Chrome extension icon. It supports visible-tab or selected-region capture and an optional instruction.

**activeTab:** Temporary access to the active tab only after the user invokes a capture shortcut, to capture the visible question. The extension does not request persistent access to all websites.

**scripting:** Runs the packaged selection overlay after the user invokes selected capture. No remote JavaScript is loaded or executed.

**storage:** Saves preferences, optional instruction, rotating device credentials, cached account status and temporary operation state locally. Captured images are not persisted.

**alarms:** Resumes polling for user-requested analysis and expires pending processing indicators when the service worker sleeps. Alarms do not initiate captures.

**Host access — https://snapgrok-api.onrender.com/*:** Sends authenticated pairing, account-status and user-requested analysis requests to Zenaian's backend over HTTPS. Captured images and instructions are processed by the backend and xAI solely for the requested answer.

**Remote code:** No. Executable scripts and styles are packaged locally. Remote AI responses are answer data, not executable code.

**Data categories:** Declare Personally identifiable information, Authentication information, Website content, and User activity. Include Web history for the local current-tab URL handling, with the explanation that selected capture uses the URL locally for restricted-page checks and does not transmit it in analysis requests or retain browsing history. Screenshots may contain incidental information; warn users to avoid sensitive content. Do not declare “no data collected” merely because content is transient. Whop checkout handles optional payments outside the extension; Zenaian retains minimum billing-state records, not full card numbers. Review the dashboard's exact category wording against these facts.

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

At least one actual product screenshot is still required, at 1280×800 or 640×400. Capture the real installed extension with a dedicated test account and a synthetic practice question. Suggested captions:
1. “Choose visible-page or selected-region capture.”
2. “Read proposed AI answers through the extension icon.”
3. “Add context with a custom instruction.”

Do not upload a mocked QA preview as an actual product screenshot. Avoid personal email addresses, real assessment material and claims of guaranteed accuracy or speed.

## Remaining disclosure issue — resolve before submitting

The current signup agreement links only to Terms and Privacy. The original extension UI is restored, including its existing AI/privacy footer, without a new consent screen. Google says a prominent disclosure cannot exist only in legal documents or the Store listing and must precede a specific affirmative agreement within the product UI. The present flow remains a material disclosure-review risk. This is separate from legal enforceability of the Terms and from Chrome's browser permission prompt.

Suggested text for a future prominent notice alongside the existing signup agreement (prepared only; not inserted into the interface):

“When you use a capture shortcut, your screenshot and optional instruction are sent over HTTPS to Zenaian and xAI to generate a proposed AI answer. Capture runs only when you request it. Zenaian does not persist captured content, and production inference requires xAI Zero Data Retention. AI answers can be wrong. Do not capture identifiable sensitive information or credentials. I agree to this processing and the Terms of Service and Privacy Policy.”

That text alone is not sufficient: users must see it and affirmatively agree before the relevant handling, and existing users must be covered too. The placement, acceptance record and capture authorization must be verified together. No claim is made that the current flow meets that requirement or that legal-document updates guarantee approval.

## Official references

• [Disclosure and consent FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
• [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
• [Image requirements](https://developer.chrome.com/docs/webstore/images)
• [First upload](https://developer.chrome.com/docs/webstore/publish)
• [Extension identity](https://developer.chrome.com/docs/extensions/reference/manifest/key)
