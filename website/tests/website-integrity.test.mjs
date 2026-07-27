import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("redesigned landing page includes the requested product workflow", () => {
  const page = read("app/page.tsx");
  assert.match(page, /Capture in silence/i);
  assert.match(page, /sneaksolve-how-it-works\.png/);
  assert.match(page, /Press your shortcut/);
  assert.match(page, /Two capture modes\. Your shortcuts\./);
  assert.match(page, /Add context when the question needs it\./);
  assert.match(page, /How the icon works/);
  assert.match(page, /Privacy &amp; Security/);
  assert.doesNotMatch(page, /Private processing/);
});

test("global header has the requested destinations", () => {
  const header = read("app/site-header.tsx");
  for (const label of ["Pricing", "Affiliate Marketing", "Privacy Policy"]) {
    assert.match(header, new RegExp(`>\\s*${label}\\s*<`));
  }
  assert.doesNotMatch(header, />Home<|>Why SneakSolve<|>Account</);
  assert.match(header, /href="\/pricing"/);
  assert.match(header, /href="\/affiliate"/);
  assert.match(header, /href="\/privacy"/);
  assert.match(header, /className="site-header shell"/);
  assert.match(header, /<AccountNav \/>/);
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
  for (const label of ["Pricing", "Affiliate Marketing", "Privacy Policy", "Account"]) {
    assert.match(footer, new RegExp(`>${label}<`));
  }
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
  assert.match(shell, /Welcome to SneakSolve\./);
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
  for (const name of ["default", "processing", "result-a", "result-multi", "result-inconclusive", "result-error"]) {
    assert.equal(existsSync(resolve(root, `public/sneaksolve-icons/${name}.png`)), true, `${name}.png missing`);
  }
  assert.equal(
    existsSync(resolve(root, "public/sneaksolve-how-it-works.png")),
    true,
    "product illustration missing",
  );
});

test("pricing is presentation-only until billing integration", () => {
  const pricing = read("app/pricing/page.tsx");
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
  assert.match(pricing, /being prepared for launch/);
  assert.doesNotMatch(pricing, /checkout|Lemon|payment/i);
});

test("affiliate page clearly describes a non-active 20 percent program preview", () => {
  const affiliate = read("app/affiliate/page.tsx");
  assert.match(affiliate, /Affiliate Marketing/);
  assert.match(affiliate, />20%</);
  assert.match(affiliate, /including users on the Free plan/);
  assert.match(affiliate, /not active yet/);
  assert.doesNotMatch(affiliate, /checkout|Lemon|payment/i);
});

test("privacy page covers the current product data flow and remains a working draft", () => {
  const privacy = read("app/privacy/page.tsx");
  for (const expected of ["Clerk", "Render", "xAI", "captured screenshots", "Working draft"]) {
    assert.match(privacy, new RegExp(expected));
  }
  assert.match(privacy, /not to save captured screenshots/);
  assert.match(privacy, /qualified legal counsel/);
});
