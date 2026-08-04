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
  assert.match(page, /Ask in Silence/);
  assert.match(page, /zenaian-how-it-works-balanced\.png/);
  assert.match(page, /Press your shortcut/);
  assert.match(page, /Two capture modes\. Your shortcuts\./);
  assert.match(page, /Add context when the question needs it\./);
  assert.match(page, /Receive your answers/);
  assert.match(page, /hero-copy-divider/);
  assert.doesNotMatch(page, /heroAnswerBadges|hero-badge-field|hero-answer-options|hero-magnifier-motion/);
  assert.match(page, /Accelerate memorization-based test preparations\./);
  assert.match(page, /Trusted by 20k\+ Active Subscribers/);
  assert.doesNotMatch(page, /className="stats-panel|Active Users|Questions Solved/);
  assert.match(page, /Powered by Grok 4\.5\./);
  assert.match(page, /Precise reasoning/);
  assert.match(page, /not affiliated with or[\s\S]*endorsed by xAI or SpaceX/);
  assert.ok(
    page.indexOf('id="why-zenaian"') < page.indexOf('id="features"'),
  );
  assert.match(page, /Privacy &amp; Security/);
  assert.doesNotMatch(page, /Private processing/);
});

test("global header has the requested destinations", () => {
  const header = read("app/site-header.tsx");
  for (const label of ["Pricing", "Privacy Policy", "Contact Us"]) {
    assert.match(header, new RegExp(`>\\s*${label}\\s*<`));
  }
  assert.doesNotMatch(header, />Home<|>Why Zenaian<|>Account|Affiliate Marketing/);
  assert.match(header, /href="\/pricing"/);
  assert.doesNotMatch(header, /href="\/affiliate"/);
  assert.match(header, /href="\/privacy"/);
  assert.match(header, /href="\/contact"/);
  assert.match(header, /className="site-header shell"/);
  assert.match(header, /<BrandLogo \/>/);
  assert.match(header, /className="brand" href="\/"/);
  assert.match(header, /<AccountNav \/>/);
});

test("logo and viewport motion refinements remain stable", () => {
  const css = read("app/globals.css");
  const motion = read("app/motion-enhancer.tsx");
  const logo = read("app/brand-logo.tsx");
  assert.match(logo, /<img src="\/zenaian-logo-full\.png"/);
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
  assert.match(css, /font-family: "EB Garamond", Garamond, Georgia, serif/);
  assert.match(css, /\.hero-description[\s\S]*font-family: "EB Garamond"/);
  assert.match(css, /--blue: #0549fd/);
  assert.match(css, /\.site-footer[\s\S]*background: #fff/);
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
  assert.doesNotMatch(footer, /Stay focused\./);
  for (const label of ["Pricing", "Privacy Policy", "Terms of Service", "Contact Us", "Account"]) {
    assert.match(footer, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(footer, /Affiliate Marketing|href="\/affiliate"/);
  assert.match(footer, /Grok is a trademark of xAI/);
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
  const page = read("app/page.tsx");
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
  assert.match(
    page,
    /result-inconclusive\.png"[\s\S]*iconClass: ""/,
  );
  assert.match(
    page,
    /result-error\.png"[\s\S]*iconClass: ""/,
  );
  assert.match(
    css,
    /\.state-card img \{ width: 56px; height: 56px;/,
  );
});

test("pricing retains the approved plans and uses the secure checkout client", () => {
  const pricing = read("app/pricing/page.tsx");
  const action = read("app/pricing/pricing-action.tsx");
  const labels = read("app/pricing/plan-labels.js");
  const css = read("app/globals.css");
  assert.match(pricing, /Plan Upgrades/);
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
  assert.match(pricing, /Secure checkout powered by Whop/);
  assert.match(pricing, /separate monthly subscriptions/);
  assert.match(action, /createBillingCheckout/);
  assert.match(action, /getToken\(\{ skipCache: true \}\)/);
  assert.match(action, /trustedBillingRedirect/);
  for (const label of [
    "Current plan",
    "Switch to Free",
    "Upgrade to Plus",
    "Buy Ultra separately",
    "Unavailable while Ultra is active",
    "Reactivate in account",
  ]) {
    assert.match(labels, new RegExp(label));
  }
  assert.match(action, /Cancel paid renewals from your account/);
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
  assert.match(panel, /Subscriptions/);
  assert.match(panel, /Payment failed/);
  assert.match(panel, /payment reversal or dispute/);
  assert.match(panel, /cancelAtPeriodEnd/);
  assert.match(panel, /Expires on/);
  assert.match(panel, /getToken\(\{ skipCache: true \}\)/);
  assert.doesNotMatch(panel, /variantId|allowance:\s*\d|LEMONSQUEEZY_/);
});

test("account plan reset date uses a valid, fail-safe Intl formatter", () => {
  const panel = read("app/account/billing-panel.tsx");
  assert.doesNotMatch(panel, /dateStyle|timeStyle/);
  assert.match(panel, /year:\s*"numeric"/);
  assert.match(panel, /timeZoneName:\s*"short"/);
  assert.match(panel, /return date\.toISOString\(\)/);
  assert.doesNotThrow(() =>
    new Intl.DateTimeFormat(undefined, {
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
  assert.match(readiness, /Please upgrade your plan or wait until the next reset/);
});

test("embedded Clerk profile is constrained without replacing Clerk account controls", () => {
  const account = read("app/account/page.tsx");
  const css = read("app/globals.css");
  assert.match(account, /<UserProfile[\s\S]*routing="hash"[\s\S]*appearance=/);
  assert.match(account, /rootBox:[\s\S]*maxWidth: "900px"/);
  assert.match(account, /cardBox:[\s\S]*maxWidth: "900px"/);
  assert.match(css, /\.profile-shell > div \{ width: min\(100%, 900px\); \}/);
  assert.match(css, /\[class\*="cl-cardBox"\][\s\S]*max-width: 900px/);
});

test("privacy page covers the current product and production billing data flow", () => {
  const privacy = read("app/privacy/page.tsx");
  for (const expected of ["Clerk", "Render", "xAI", "Whop", "PostgreSQL", "captured screenshots", "Working draft"]) {
    assert.match(privacy, new RegExp(expected));
  }
  assert.match(privacy, /not to save captured screenshots/);
  assert.match(privacy, /qualified legal counsel/);
});
