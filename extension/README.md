# Zenaian Chrome Web Store release

The first store release is version `1.0.0`. Its short description is:

> Capture visible or selected multiple-choice questions and receive proposed answers through the Chrome extension icon.

## Build the upload ZIP

From the repository root, run:

```powershell
./extension/package.ps1 -OutputPath C:/path/to/zenaian-chrome-1.0.0.zip
```

Choose a new output path. The script packages only the 15 runtime files and 52 required icons. It preserves the existing public manifest key, puts `manifest.json` at the ZIP root, and excludes tests, packaging tools, unused fonts, and source artwork. It prints the SHA-256 digest for the resulting ZIP. Do not include a private signing key or any server credentials.

## Verify identity before submitting

The current development public key derives the extension ID `jjgjlopdpefphgappfmkkkpiknpnoijb`. The website build setting `NEXT_PUBLIC_EXTENSION_ID`, API setting `EXTENSION_IDS`, and the API's permitted Chrome-extension origin must agree with the installed extension's ID.

A manifest key keeps an unpacked development ID stable; do not assume it chooses the first Web Store item's ID. Upload the ZIP as a draft first and compare its Item ID. If it differs, keep the draft and update the production configuration for that exact store ID before submission. Copy the draft's public key from Package → View public key into the local manifest when testing unpacked builds, so they use the store ID. Preserve the existing development mapping only if it remains needed; never replace the allowlist with a wildcard. No private key is needed for this comparison. Once the listing is published, set the website's `NEXT_PUBLIC_CHROME_WEB_STORE_URL` to its actual listing URL and rebuild the website so its install buttons open this item.

[Google's extension identity instructions](https://developer.chrome.com/docs/extensions/reference/manifest/key)

## Upload steps

1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) using the verified trader publisher account. Ensure two-step verification and publisher contact verification are complete.
2. Choose **Add new item**, select the ZIP, and upload. Do not use Chrome's “Pack extension” CRX for this ordinary ZIP upload. Validate the new Item ID as described above. Keep the same draft instead of creating duplicate items.
3. Complete **Store listing**: title “Zenaian MCQ Assistant,” the short description above, an accurate detailed description, English, and the relevant study/productivity category offered by the dashboard. Set the homepage to `https://www.zenaian.com`, support to `https://www.zenaian.com/account` and/or the configured support email, and privacy policy to `https://www.zenaian.com/privacy`. The detailed description must disclose the required account/internet connection, AI processing, and optional paid plans. Do not claim guaranteed accuracy, instant responses, rank, or user counts without evidence.
4. Supply the 128×128 PNG icon, a 440×280 promotional tile, and at least one genuine screenshot of the extension (1280×800 or 640×400). Show the real popup, capture workflow, and/or toolbar result. Use synthetic practice questions and no personal account information. A local mocked QA preview is not a production screenshot and is not supplied as store artwork.
5. Complete **Privacy practices** using the purpose, permission explanations, and data-use notes below. Certify only statements that match actual operation. “No data collected” is incorrect even though screenshots are not persistently saved. Local storage and transient processing count as data handling.
6. In **Distribution**, choose Public and the countries you intend to support. Declare optional paid features/in-app purchases where the dashboard asks. In reviewer/test instructions, provide the complete sign-in/pairing/capture steps. Give reviewers a dedicated ordinary test account if login is required; do not include credentials in the public listing, ZIP, or repository, and do not introduce an authentication bypass.
7. Test the store-ID-aligned build: login/signup, pairing, full capture, selected capture, toolbar single/multiple/inconclusive/error states, instruction editing, Chrome disable/re-enable, and sign-out. Chrome does not permit selected-area injection on all browser-owned pages; use an ordinary HTTPS practice page for the main test. Paid billing functions live on the website.
8. Save all fields, then **Submit for review**. For a controlled release, turn off automatic publishing after approval. After approval, publish when the production ID configuration and final smoke test are ready.

[Upload guide](https://developer.chrome.com/docs/webstore/publish) · [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) · [Image sizes](https://developer.chrome.com/docs/webstore/images)

## Copy for the single-purpose field

Zenaian analyzes a user-requested screenshot of one multiple-choice question and displays proposed AI answer labels through the Chrome extension icon. It supports capture of the visible tab or a selected region, with an optional user instruction.

## Permission justifications

| Permission | Explanation |
|---|---|
| `activeTab` | Grants temporary access to the tab when the user invokes a capture shortcut, to capture the visible question. No persistent access to all websites is requested. |
| `scripting` | Injects the packaged selected-area overlay only after the user invokes selected capture. No remote script is downloaded or executed. |
| `storage` | Saves settings, rotating device credentials/account status locally, and temporary operation state. Screenshots are not persisted. |
| `alarms` | Resumes polling and expires pending analysis/processing indicators when the service worker sleeps. Alarms do not trigger new screen captures. |
| API host permission | Communicates over HTTPS with `https://snapgrok-api.onrender.com` for authenticated pairing, status, and user-requested analysis. |

The only externally connectable website is `https://www.zenaian.com`. Its messages pair/revoke the extension and check connection status; they do not trigger a screenshot.

## Privacy practices notes

Declare **Personally identifiable information** (email/profile/account IDs), **Authentication information** (device credentials/session data), **Website content** (requested screenshots and optional instruction), and **User activity** (capture/operation/usage metadata). Disclose the current tab URL inspection under **Web history** if categorizing local URL handling in that field: the URL is used locally for restricted-page checks, not transmitted in analysis requests or retained as browsing history. Google requires local handling to be disclosed too; do not imply that “not saved” means “not processed.”

Screenshots and instructions are sent to the Zenaian API and xAI solely for the requested answer. Production inference requires xAI Zero Data Retention. Account processing uses Clerk; optional billing uses Whop; hosting uses Render. No captured content is sold, used for advertising, or retained as an application database record. Captures can contain incidental personal information, so users must select carefully and must not submit identifiable sensitive records or credentials.

Remote AI results are data. All extension executable logic and styles are packaged locally; no remote hosted code, eval, obfuscation, advertising, notification spam, or broad all-site host permissions were found in the reviewed extension. Authenticated backend availability, privacy behavior, billing quotas, and the registered store ID remain dependencies of the service.

## Reviewer workflow

Install the review item, pin its icon, open the popup, and select “Log in or sign up.” Sign in to the supplied ordinary test account at `www.zenaian.com`; the account page securely pairs the installed extension. Reopen the popup. On an ordinary HTTPS page showing a single synthetic MCQ, use Ctrl+Shift+Z (visible capture) or Ctrl+Shift+X (selected capture), then observe the icon. macOS uses Command instead of Ctrl. Shortcut assignment can be changed through Edit → Chrome's shortcut settings. Free accounts currently have five questions per UTC day; completed inconclusive results also use an allowance. A paid purchase is not required to review the basic capture workflow.

## Disclosure review before submission

The original extension interface is preserved. It includes the existing AI/privacy notice, but has no new consent screen or capture-consent gate. A generic agreement to Terms/Privacy, the browser permission prompt, and the ability to disable an extension do not establish compliance with Google's separate prominent-disclosure requirement. Google says a disclosure cannot exist only in legal documents or the Store listing. Verify that the actual signup/product flow prominently describes screenshot/instruction transfer to Zenaian and xAI before a specific affirmative action; do not claim such consent exists unless verified. See [Google's FAQ, question 10](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). The listing copy and artwork are in `store/LISTING.md`; they do not replace an in-product disclosure.

Google uses automated and manual review. New developers/items, sensitive permissions, and hard-to-review code can receive more scrutiny. Clear disclosures and readable minimal code reduce avoidable issues, but no implementation can guarantee approval or exemption from manual review. [Review process](https://developer.chrome.com/docs/webstore/review-process)
