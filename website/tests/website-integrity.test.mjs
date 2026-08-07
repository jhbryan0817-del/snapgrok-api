import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readBytes = (path) => readFileSync(resolve(root, path));

test("redesigned landing page includes the requested product workflow", () => {
  const page = read("app/page.tsx");
  const heroDemo = read("app/hero-browser-demo.tsx");
  const answerToolbar = read("app/answer-toolbar-demo.tsx");
  const workflowPreferences = read("app/workflow-preferences-demo.tsx");
  assert.match(page, /Ask in Silence/);
  assert.match(page, /#1 AI-Powered MCQ Assistant Tool/);
  assert.match(page, /<HeroBrowserDemo \/>/);
  assert.match(heroDemo, /Press your shortcut/);
  assert.match(heroDemo, /Capture the question/);
  assert.match(heroDemo, /Read the answer/);
  assert.match(heroDemo, /toolbar-icon-processing/);
  assert.match(heroDemo, /toolbar-icon-answer">B/);
  assert.match(heroDemo, /What is known as the powerhouse of the cell\?/);
  assert.doesNotMatch(heroDemo, /Answer confirmed|demo-confirmation|toolbar-confirmation-pulse/);
  assert.match(page, /Two capture modes\. Your shortcuts\./);
  assert.match(page, /Add context when the question needs it\./);
  assert.match(workflowPreferences, /<select/);
  assert.match(workflowPreferences, /<textarea/);
  assert.match(workflowPreferences, /type="submit">Save/);
  assert.match(workflowPreferences, /nothing is sent or stored/);
  assert.doesNotMatch(page, /BUILT AROUND YOUR WORKFLOW|Explore Zenaian before you begin|Choose how you capture|Receive your answers|Select or hover over an icon state|Comprehensive Customizability|Accelerate Test Preparation/);
  assert.match(page, /<AnswerToolbarDemo \/>/);
  assert.doesNotMatch(page, /feature-number/);
  assert.match(answerToolbar, /zenaian\.com\/icons-explanation/);
  assert.match(answerToolbar, /onMouseEnter=\{\(\) => setActiveId\(state\.id\)\}/);
  assert.match(answerToolbar, /onClick=\{\(\) => setActiveId\(state\.id\)\}/);
  assert.match(answerToolbar, /useState[\s\S]*\(null\)/);
  assert.match(answerToolbar, /icon: "\/zenaian-search-icon-v2\.png"/);
  assert.match(answerToolbar, /onMouseLeave=\{\(\) => setActiveId\(null\)\}/);
  assert.match(answerToolbar, /onBlur=\{\(\) => setActiveId\(null\)\}/);
  assert.match(answerToolbar, /Multiple answers\. Hover or focus to reveal A and C/);
  assert.equal((page.match(/hero-copy-divider/g) ?? []).length, 1);
  assert.doesNotMatch(page, /heroAnswerBadges|hero-badge-field|hero-answer-options|hero-magnifier-motion/);
  assert.match(page, /Fewer steps between a question and understanding\./);
  assert.doesNotMatch(page, /Stay in your study flow while Zenaian removes/);
  assert.doesNotMatch(page, /subject-chips|>Psychology<|>Anatomy</);
  assert.match(page, /Screenshot[\s\S]*Switch screen[\s\S]*Paste and ask[\s\S]*Confirm[\s\S]*Return/i);
  assert.match(page, /flowchart-path-zenaian[\s\S]*Capture[\s\S]*Confirm/);
  assert.doesNotMatch(page, /flowchart-path-zenaian[\s\S]*Continue/);
  assert.match(page, /Trusted by 20,000\+ Users/);
  assert.doesNotMatch(page, /className="stats-panel|Active Users|Questions Solved/);
  assert.match(page, /Powered by Grok 4\.5\./);
  assert.match(page, /SWE Marathon/);
  assert.doesNotMatch(page, /SWE Bench Pro efficiency/);
  assert.match(page, /benchmark-visual benchmark-visual-single/);
  assert.match(page, /https:\/\/x\.ai\/news\/grok-4-5/);
  assert.match(page, /not endorsed by xAI/);
  assert.ok(
    page.indexOf("<AnswerToolbarDemo />") < page.indexOf('className="feature-grid explore-controls-grid"'),
  );
  assert.ok(
    page.indexOf('className="hero-description"') < page.indexOf("<HeroBrowserDemo />") &&
      page.indexOf("<HeroBrowserDemo />") < page.indexOf('className="hero-followup'),
  );
  assert.match(page, /href="#receive-answers">Explore features/);
  assert.match(page, /Privacy &amp; Security/);
  assert.doesNotMatch(page, /Private processing/);
  assert.match(heroDemo, /zenaian\.com\/use-example/);
});

test("interactive previews are local-only and supporting pages share the landing visual system", () => {
  const preview = read("app/workflow-preferences-demo.tsx");
  const css = read("app/globals.css");
  assert.match(preview, /event\.preventDefault\(\)/);
  assert.match(preview, /setSaved\(true\)/);
  assert.match(preview, /Interactive preview only/);
  assert.match(preview, /nothing is sent or stored/);
  assert.doesNotMatch(preview, /fetch\(|localStorage|sessionStorage|chrome\.|Clerk|billing|apiClient/);
  assert.match(css, /:is\(\.pricing-hero, \.editorial-hero, \.policy-hero\)/);
  assert.match(css, /font-family: var\(--font-eb-garamond\), Georgia, "Times New Roman", serif/);
  for (const path of [
    "app/pricing/page.tsx",
    "app/use-cases/page.tsx",
    "app/careers/page.tsx",
    "app/terms/page.tsx",
    "app/privacy/page.tsx",
  ]) {
    assert.match(read(path), /<SiteHeader(?:\s+[^>]*)?\s*\/>/);
  }
});

test("hero shortcut, scan, and icon states share one cycle on desktop and reduced-motion devices", () => {
  const css = read("app/globals.css");
  assert.match(css, /--demo-duration: 8s/);
  assert.match(css, /aspect-ratio: 16 \/ 7\.25/);
  assert.doesNotMatch(css, /animation-play-state: paused/);
  assert.match(css, /demo-icon-idle var\(--demo-duration\) linear infinite !important/);
  assert.match(css, /demo-icon-processing var\(--demo-duration\) linear infinite !important/);
  assert.match(css, /demo-icon-answer var\(--demo-duration\) linear infinite !important/);
  assert.match(css, /demo-shortcut-cycle var\(--demo-duration\) ease-in-out infinite !important/);
  assert.match(css, /demo-capture-cycle var\(--demo-duration\) ease-in-out infinite !important/);
  assert.match(css, /37\.5%, 68\.74% \{ opacity: 1/);
  assert.match(css, /68\.75%, 99\.99% \{ opacity: 1/);
});

test("global header has the requested destinations", () => {
  const header = read("app/site-header.tsx");
  for (const label of ["Pricing", "Use Cases", "Careers", "Contact Us"]) {
    assert.match(header, new RegExp(`>\\s*${label}\\s*<`));
  }
  assert.doesNotMatch(header, />Home<|>Why Zenaian<|>Account|Affiliate Marketing/);
  assert.match(header, /href="\/pricing"/);
  assert.match(header, /href="\/use-cases"/);
  assert.match(header, /href="\/careers"/);
  assert.doesNotMatch(header, /nav-placeholder|Coming soon/);
  assert.doesNotMatch(header, /href="\/affiliate"/);
  assert.doesNotMatch(header, /Privacy Policy|href="\/privacy"/);
  assert.match(header, /href="mailto:sneaksolve@gmail\.com"/);
  assert.doesNotMatch(header, /href="\/contact"/);
  assert.match(header, /site-header shell\$\{isCondensed \? " site-header-condensed" : ""\}/);
  assert.match(header, /window\.scrollY > 48/);
  assert.match(header, /requestAnimationFrame\(updateHeader\)/);
  assert.match(header, /<BrandLogo \/>/);
  assert.match(header, /className="brand" href="\/"/);
  assert.match(header, /<AccountNav \/>/);
});

test("logo and viewport motion refinements remain stable", () => {
  const css = read("app/globals.css");
  const motion = read("app/motion-enhancer.tsx");
  const logo = read("app/brand-logo.tsx");
  assert.match(logo, /className="brand-logo-image" src="\/zenaian-logo-transparent\.png"/);
  assert.doesNotMatch(logo, /brand-logo-icon|brand-logo-wordmark/);
  assert.match(css, /\.site-header \{[^}]*height: 78px;[^}]*min-height: 78px;/);
  assert.match(css, /\.brand \.brand-logo \{[^}]*width: 108px;[^}]*height: 26px;/);
  assert.match(css, /\.footer-brand \.brand-logo-compact \{[^}]*width: 92px;[^}]*height: 22px;/);
  assert.match(css, /\.primary-button \{[^}]*backdrop-filter: none;[^}]*background: var\(--ink\);/);
  assert.doesNotMatch(logo, /brand-logo-ai|brand-logo-a-dots/);
  assert.match(css, /\.product-illustration[\s\S]*width: min\(900px, 100%\)/);
  assert.match(css, /\.hero-copy-divider/);
  assert.match(css, /\.hero-product-screen[\s\S]*border-radius: 22px/);
  assert.doesNotMatch(css, /\.hero-answer-option:hover|@keyframes magnifier-drift|@keyframes badge-float/);
  assert.doesNotMatch(css, /animation-timeline/);
  assert.match(motion, /IntersectionObserver/);
  assert.match(motion, /classList\.add\("is-visible"\)/);
  assert.match(motion, /usePathname/);
  assert.match(motion, /classList\.toggle\("is-visible", entry\.isIntersecting\)/);
  assert.doesNotMatch(motion, /observer\.unobserve/);
  assert.match(css, /\.hero h1 \{[\s\S]*font-family: var\(--font-eb-garamond\), Georgia, "Times New Roman", serif/);
  assert.match(css, /\.trust-pill \{[\s\S]*background: transparent[\s\S]*font-family: var\(--font-eb-garamond\)/);
  assert.match(css, /\.hero-description \{[^}]*font-weight: 600/);
  assert.match(css, /\.hero \{[\s\S]*padding-top: 36px/);
  assert.match(css, /\.frontier-panel \{[\s\S]*rgba\(234,238,247,\.97\)/);
  assert.match(css, /--blue: #0549fd/);
  assert.match(css, /\.site-footer[\s\S]*background: #fff/);
  assert.match(css, /\.site-header-condensed \{[^}]*scale\(\.86\)[^}]*rgba\(255, 255, 255, \.52\)/);
  assert.match(css, /\.demo-answer-list \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /@keyframes demo-question-cycle/);
});

test("home, auth and account pages all use the global header", () => {
  assert.match(read("app/page.tsx"), /<SiteHeader \/>/);
  assert.match(read("app/auth-shell.tsx"), /<SiteHeader \/>/);
  assert.match(read("app\/account\/page.tsx"), /<SiteHeader \/>/);
});

test("global footer contains navigation and accurate xAI trademark attribution", () => {
  const layout = read("app/layout.tsx");
  const footer = read("app/site-footer.tsx");
  assert.match(layout, /<SiteFooter \/>/);
  for (const label of ["Pricing", "Use Cases", "Careers", "Privacy Policy", "Terms of Service", "Contact Us", "Account"]) {
    assert.match(footer, new RegExp(`>${label}<`));
  }
  assert.match(footer, /href="mailto:sneaksolve@gmail\.com"/);
  assert.doesNotMatch(footer, /Affiliate Marketing|href="\/affiliate"/);
  assert.match(footer, /Grok is a trademark of xAI/);
  assert.doesNotMatch(footer, /Stay focused\./);
  assert.match(footer, /not affiliated with or endorsed by xAI/);
});

test("all Clerk sign-in and sign-up completions return to account management", () => {
  for (const path of ["app/sign-in/page.tsx", "app/sign-up/page.tsx", "app/account/page.tsx"]) {
    const source = read(path);
    assert.match(source, /forceRedirectUrl="\/account"/);
    assert.match(source, /fallbackRedirectUrl="\/account"/);
  }
});

test("authentication shell is intentionally simple", () => {
  const shell = read("app/auth-shell.tsx");
  assert.match(shell, /Welcome to Zenaian\./);
  assert.match(shell, /auth-simple-card/);
  assert.doesNotMatch(shell, /auth-proof-card|auth-assurance|auth-mode-switch/);
});

test("Clerk card is centered inside the authentication panel", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.auth-simple-card \.clerk-surface[\s\S]*justify-content: center/);
  assert.match(css, /\[class\*="cl-rootBox"\][\s\S]*justify-content: center/);
  assert.match(css, /\[class\*="cl-cardBox"\][\s\S]*margin-inline: auto/);
});

test("profile popover escapes demo clipping and retains working actions", () => {
  const nav = read("app/account-nav.tsx");
  const css = read("app/globals.css");
  assert.match(nav, /createPortal\(popover, document\.body\)/);
  assert.match(nav, /href="\/account"/);
  assert.match(nav, /signOut\(\{ redirectUrl: "\/" \}\)/);
  assert.match(css, /\.account-popover-portal[\s\S]*position: fixed/);
  assert.match(css, /z-index: 10000/);
});

test("signed-out navigation uses the verified account-mode routes", () => {
  const nav = read("app/account-nav.tsx");
  assert.match(nav, /href="\/account\?mode=sign-in"/);
  assert.match(nav, /href="\/account\?mode=sign-up"/);
});

test("authentication and synchronization configuration stays intact", () => {
  const provider = read("app/clerk-provider.tsx");
  const config = read("next.config.ts");
  const proxy = read("proxy.ts");
  assert.match(provider, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(provider, /match\[1\] !== "live"/);
  assert.match(provider, /afterSignOutUrl="\/"/);
  assert.match(config, /NEXT_PUBLIC_CLERK_FRONTEND_API_URL/);
  assert.match(proxy, /Content-Security-Policy/);
});

test("all required public assets exist", () => {
  for (const name of ["processing", "result-a", "result-multi", "result-inconclusive", "result-error"]) {
    assert.equal(existsSync(resolve(root, `public/zenaian-icons/${name}.png`)), true, `${name}.png missing`);
  }
  assert.equal(
    existsSync(resolve(root, "public/zenaian-how-it-works-clean.png")),
    true,
    "product illustration missing",
  );
});

test("answer-state icons retain the requested artwork and balanced sizing", () => {
  const toolbar = read("app/answer-toolbar-demo.tsx");
  const css = read("app/globals.css");
  const inconclusive = readBytes(
    "public/zenaian-icons/result-inconclusive.png",
  );
  assert.equal(
    createHash("sha256").update(inconclusive).digest("hex"),
    "83d56cd93cd97b9c258c4fb689c196c08c679cc7d01b72a4bd74c33660ff27e1",
    "The reviewed website inconclusive artwork changed.",
  );
  assert.equal(inconclusive.readUInt32BE(16), 1254);
  assert.equal(inconclusive.readUInt32BE(20), 1254);
  for (const name of ["processing", "result-a", "result-multi", "result-inconclusive", "result-error"]) {
    assert.match(toolbar, new RegExp(`/zenaian-icons/${name}\\.png`));
  }
  assert.match(css, /\.answer-toolbar-active-icon img \{[\s\S]*width: 48px;[\s\S]*height: 48px;/);
  assert.match(css, /\.answer-state-tab > img \{[\s\S]*object-fit: contain;/);
});

test("pricing retains the approved plans and uses the secure checkout client", () => {
  const pricing = read("app/pricing/page.tsx");
  const action = read("app/pricing/pricing-action.tsx");
  const labels = read("app/pricing/plan-labels.js");
  const css = read("app/globals.css");
  assert.doesNotMatch(pricing, /SIMPLE PRICING|Plan Upgrades|Start with five questions a day/);
  assert.match(pricing, /5 questions every day/);
  assert.match(pricing, /200 questions every month/);
  assert.match(pricing, /300 questions every month/);
  assert.match(pricing, /Grok 4\.3/);
  assert.match(pricing, /Grok 4\.5/);
  assert.match(pricing, /Everything offered in the Free plan/);
  assert.match(pricing, /More flexible usage/);
  assert.doesNotMatch(pricing, /40x the Free monthly capacity/);
  assert.match(pricing, /name: "Ultra"[\s\S]*featured: true/);
  assert.match(pricing, /name: "Plus"[\s\S]*featured: false/);
  assert.match(css, /\.pricing-popular\s*\{/);
  assert.doesNotMatch(action, /pricing-cta-primary|featured:/);
  assert.doesNotMatch(css, /\.pricing-cta-primary\s*\{/);
  assert.match(pricing, /<PricingAction/);
  assert.match(pricing, /<BillingStatusProvider>/);
  assert.doesNotMatch(pricing, /Secure checkout powered by Whop|One paid plan can be active per account|pricing-launch-note/);
  assert.match(action, /createBillingCheckout/);
  assert.match(action, /getToken\(\{ skipCache: true \}\)/);
  assert.match(action, /trustedBillingRedirect/);
  for (const label of [
    "Current plan",
    "Switch to Free",
    "Upgrade to Plus",
    "Switch to Plus",
    "Switch to Ultra",
  ]) {
    assert.match(labels, new RegExp(label));
  }
  assert.match(action, /cancelBillingMembership/);
  assert.match(action, /create a separate account to subscribe immediately/);
  assert.match(action, /currentPlan === "plus" && plan === "ultra"/);
  assert.match(action, /currentPlan === "plus" && plan === "ultra"[\s\S]*\? "create-account"/);
  assert.match(action, /"Create account"/);
  assert.match(action, /clearExtensionAccessBeforeSignOut/);
  assert.match(action, /signOut\(\{ redirectUrl: "\/account\?mode=sign-in" \}\)/);
  assert.match(action, /notice\.action === "open-account"/);
  assert.doesNotMatch(action, /<a href="\/account">Open account<\/a>\s*<button/);
  assert.match(action, /overlappingLegacySubscriptions/);
  assert.doesNotMatch(action, /LEMONSQUEEZY_(?:API_KEY|WEBHOOK_SECRET)/);
});

test("account plan panel reads server-authoritative status and cancels through the API", () => {
  const account = read("app/account/page.tsx");
  const boundary = read("app/account/billing-panel-boundary.tsx");
  const panel = read("app/account/billing-panel.tsx");
  const provider = read("app/billing-status-context.tsx");
  assert.match(account, /<BillingPanelBoundary>[\s\S]*<BillingPanel \/>[\s\S]*<\/BillingPanelBoundary>/);
  assert.match(account, /<BillingStatusProvider>/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /Your account and extension[\s\S]*are still available/);
  assert.match(provider, /getBillingStatus/);
  assert.match(provider, /getToken\(\{ skipCache: true \}\)/);
  assert.match(panel, /useBillingStatus/);
  assert.match(panel, /cancelBillingMembership/);
  assert.match(panel, /reactivateBillingMembership/);
  assert.match(panel, /getBillingHistory/);
  assert.match(panel, /Payment history/);
  assert.match(panel, /Paid, disputed, and refunded payments/);
  assert.match(panel, /manageableSubscriptions/);
  assert.match(panel, /Cancel\$\{planLabel\} renewal/);
  assert.match(panel, /Reactivate\$\{planLabel\} renewal/);
  assert.match(panel, /overlapping paid memberships created under the/);
  assert.match(panel, /will\s+not silently cancel or merge a paid membership/);
  assert.doesNotMatch(panel, /billing-subscriptions|billing-subscription-row|<h3>Subscriptions<\/h3>/);
  assert.match(panel, /cancelAtPeriodEnd/);
  assert.match(panel, /Expires on/);
  assert.match(panel, /getToken\(\{ skipCache: true \}\)/);
  assert.doesNotMatch(panel, /variantId|allowance:\s*\d|LEMONSQUEEZY_/);
});

test("the site uses transparent brand assets for the favicon and header logo", () => {
  const layout = read("app/layout.tsx");
  const headerLogo = read("app/brand-logo.tsx");
  const searchIcon = readBytes("public/zenaian-search-icon-v2.png");
  assert.match(layout, /url: "\/zenaian-search-icon-v2\.png"/);
  assert.match(layout, /sizes: "96x96"/);
  assert.match(layout, /@fontsource\/eb-garamond\/latin-600\.css/);
  assert.equal(existsSync(resolve(root, "public/zenaian-search-icon-v2.png")), true);
  assert.equal(searchIcon.readUInt32BE(16), 96);
  assert.equal(searchIcon.readUInt32BE(20), 96);
  assert.equal(existsSync(resolve(root, "public/zenaian-logo-transparent.png")), true);
  assert.match(headerLogo, /src="\/zenaian-logo-transparent\.png"/);
});

test("account plan reset date uses a valid, fail-safe Intl formatter", () => {
  const panel = read("app/account/billing-panel.tsx");
  assert.doesNotMatch(panel, /dateStyle|timeStyle/);
  assert.match(panel, /year:\s*"numeric"/);
  assert.match(panel, /timeZoneName:\s*"short"/);
  assert.match(panel, /Intl\.DateTimeFormat\("en-US"/);
  assert.match(panel, /return date\.toISOString\(\)/);
  assert.doesNotThrow(() =>
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date("2026-07-27T12:00:00.000Z")),
  );
});

test("affiliate marketing is absent from public routes and navigation", () => {
  assert.equal(existsSync(resolve(root, "app/affiliate/page.tsx")), false);
  assert.doesNotMatch(read("app/site-header.tsx"), /Affiliate Marketing|href="\/affiliate"/);
  assert.doesNotMatch(read("app/site-footer.tsx"), /Affiliate Marketing|href="\/affiliate"/);
});

test("account readiness combines extension installation and server quota state", () => {
  const account = read("app/account/page.tsx");
  const readiness = read("app/account/account-readiness.tsx");
  const extensionApi = read("app/extension-api.ts");
  assert.match(account, /<AccountReadiness \/>/);
  assert.doesNotMatch(account, /account-summary-grid|Extension access|Security controls|Quick sign out/);
  assert.match(extensionApi, /NEXT_PUBLIC_EXTENSION_ID/);
  assert.match(read(".env.example"), /jjgjlopdpefphgappfmkkkpiknpnoijb/);
  // Protocol message names remain stable so an updated website can still
  // coordinate safely with extension installs during the brand migration.
  assert.match(readiness, /SNEAKSOLVE_EXTENSION_PING/);
  assert.match(readiness, /SNEAKSOLVE_EXTENSION_PAIRING_NONCE_REQUEST/);
  assert.match(readiness, /SNEAKSOLVE_EXTENSION_PAIR/);
  assert.match(readiness, /status\.usage\.remaining <= 0/);
  assert.match(readiness, /Ready\. Make sure that your extension is pinned/);
  assert.match(readiness, /Please download the extension/);
  assert.match(readiness, /No questions left—upgrade or wait for reset/);
  assert.match(account, /Good morning/);
  assert.match(account, /Good afternoon/);
  assert.match(account, /Good evening/);
});

test("shared sign-out cleanup protects both the account menu and separate-account flow", () => {
  const helper = read("app/sign-out.ts");
  const nav = read("app/account-nav.tsx");
  const action = read("app/pricing/pricing-action.tsx");
  assert.match(helper, /revokeExtensionSessions/);
  assert.match(helper, /SNEAKSOLVE_EXTENSION_REVOKED/);
  assert.match(helper, /ZENAIAN_EXTENSION_ID/);
  assert.match(nav, /clearExtensionAccessBeforeSignOut/);
  assert.match(action, /clearExtensionAccessBeforeSignOut/);
});

test("Use Cases and Careers pages are substantive and linked globally", () => {
  const useCases = read("app/use-cases/page.tsx");
  const careers = read("app/careers/page.tsx");
  const header = read("app/site-header.tsx");
  const footer = read("app/site-footer.tsx");
  assert.match(useCases, /memorization-heavy courses/);
  assert.match(useCases, /Screenshot → Switch screen → Paste and ask → Confirm → Return/);
  assert.match(useCases, /Capture → Confirm/);
  assert.match(useCases, /must not be used to cheat/);
  assert.match(careers, /Company/);
  assert.match(careers, /Mission/);
  assert.match(careers, /Vision/);
  assert.match(careers, /POSITIONS AVAILABLE/);
  assert.match(careers, /Application security engineer/);
  assert.match(careers, /Growth and lifecycle marketer/);
  assert.match(careers, /mailto:sneaksolve@gmail\.com\?subject=Zenaian%20Career%20Application/);
  for (const source of [header, footer]) {
    assert.match(source, /href="\/use-cases"/);
    assert.match(source, /href="\/careers"/);
  }
});

test("embedded Clerk profile is constrained inside a collapsed account disclosure", () => {
  const account = read("app/account/page.tsx");
  const css = read("app/globals.css");
  assert.match(account, /<details[\s\S]*className="account-settings-section account-settings-disclosure"[\s\S]*aria-labelledby="account-settings-title"/);
  assert.match(account, /<summary className="account-settings-summary">/);
  assert.match(account, /account-settings-chevron/);
  assert.match(account, /className="account-settings-summary-title"[\s\S]*role="heading"[\s\S]*aria-level=\{2\}/);
  assert.doesNotMatch(account, /<details[^>]*open/);
  assert.match(account, /<UserProfile[\s\S]*routing="hash"[\s\S]*appearance=/);
  assert.match(account, /rootBox:[\s\S]*maxWidth: "900px"/);
  assert.match(account, /cardBox:[\s\S]*maxWidth: "900px"/);
  assert.match(css, /\.profile-shell > div \{ width: min\(100%, 900px\); \}/);
  assert.match(css, /\[class\*="cl-cardBox"\][\s\S]*max-width: 900px/);
  assert.match(css, /\.account-settings-disclosure\[open\] \.account-settings-chevron/);
});

test("privacy page covers the current product and production billing data flow", () => {
  const privacy = read("app/privacy/page.tsx");
  for (const expected of ["Clerk", "Render", "xAI", "Whop", "PostgreSQL", "captured screenshots", "Working draft"]) {
    assert.match(privacy, new RegExp(expected));
  }
  assert.match(privacy, /designed not to save captured screenshots/);
  assert.doesNotMatch(privacy, /policy-draft-note|qualified counsel|product-aligned/);
  assert.doesNotMatch(read("app/terms/page.tsx"), /policy-draft-note|qualified counsel|product-aligned/);
  assert.match(privacy, /rotating, expiring device-session credentials/i);
  assert.match(privacy, /Chrome Web Store User Data Policy/);
  assert.match(privacy, /do not sell personal information/i);
  assert.match(privacy, /mailto:sneaksolve@gmail\.com/);
});

test("terms prohibit cheating and describe the current product and billing rules", () => {
  const terms = read("app/terms/page.tsx");
  for (const expected of [
    "Cheating with Zenaian is strictly prohibited",
    "may be reported or",
    "prosecuted",
    "Only one paid plan may be active on a Zenaian account at a time",
    "Whop",
    "no free trial",
    "non-refundable",
  ]) {
    assert.match(terms, new RegExp(expected, "i"));
  }
  assert.match(terms, /access a device, account, network, file, or service without/);
  assert.match(terms, /mailto:sneaksolve@gmail\.com/);
});

test("Whop checkout terms separately describe Plus and Ultra recurring purchases", () => {
  const checkoutTerms = read("WHOP_CHECKOUT_TERMS.md");
  assert.match(checkoutTerms, /Plus provides up to 200 successful question analyses/);
  assert.match(checkoutTerms, /Ultra provides up to 300 successful question analyses/);
  assert.match(checkoutTerms, /NO FREE TRIAL/g);
  assert.match(checkoutTerms, /REFUNDS:/g);
  assert.match(checkoutTerms, /non-waivable consumer or card-network rights/g);
  assert.match(checkoutTerms, /https:\/\/www\.zenaian\.com\/terms/g);
  assert.match(checkoutTerms, /https:\/\/www\.zenaian\.com\/privacy/g);
});

test("the removed contact route is replaced by direct email links", () => {
  assert.equal(existsSync(resolve(root, "app/contact/page.tsx")), false);
  assert.match(read("app/site-header.tsx"), /mailto:sneaksolve@gmail\.com/);
  assert.match(read("app/site-footer.tsx"), /mailto:sneaksolve@gmail\.com/);
});
