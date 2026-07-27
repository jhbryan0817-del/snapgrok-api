import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("frontend configuration has no Clerk development-key fallback", async () => {
  const provider = await fs.readFile("app/clerk-provider.tsx", "utf8");
  assert.match(provider, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required/);
  assert.match(provider, /const match = \/\^pk_\(live\|test\)_/);
  assert.match(provider, /match\[1\] !== "live"/);
  assert.doesNotMatch(provider, /accounts\.dev/);
});

test("security headers include CSP, clickjacking, and MIME protections", async () => {
  const config = await fs.readFile("next.config.ts", "utf8");
  const proxy = await fs.readFile("proxy.ts", "utf8");
  for (const expected of [
    "X-Content-Type-Options",
    "Strict-Transport-Security",
    "X-Permitted-Cross-Domain-Policies",
    "Origin-Agent-Cluster",
    "Permissions-Policy",
    "NEXT_PUBLIC_CLERK_FRONTEND_API_URL",
    "private, no-store, no-cache",
    "X-Robots-Tag",
  ]) {
    assert.match(config, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const expected of [
    "Content-Security-Policy",
    "frame-ancestors 'none'",
    "script-src-attr 'none'",
    "'strict-dynamic'",
    "'nonce-",
    "x-nonce",
    "https://*.protect.clerk.com",
  ]) {
    assert.match(proxy, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(`${config}\n${proxy}`, /accounts\.dev|script-src[^;\n]*'unsafe-inline'/);
});

test("production environment example uses one consistent Clerk and site origin", async () => {
  const environment = await fs.readFile(".env.example", "utf8");
  assert.match(
    environment,
    /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuc25lYWtzb2x2ZS5jb20k/,
  );
  assert.match(
    environment,
    /NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https:\/\/clerk\.sneaksolve\.com/,
  );
  assert.match(
    environment,
    /NEXT_PUBLIC_SITE_URL=https:\/\/www\.sneaksolve\.com/,
  );
  assert.doesNotMatch(environment, /pk_test_|accounts\.dev|localhost/);
});

test("public pages use the SneakSolve product name", async () => {
  for (const file of [
    "app/page.tsx",
    "app/account/page.tsx",
    "app/auth-shell.tsx",
    "app/sign-in/page.tsx",
    "app/sign-up/page.tsx",
    "app/pricing/page.tsx",
    "app/affiliate/page.tsx",
    "app/privacy/page.tsx",
    "app/site-footer.tsx",
  ]) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(source, /SnapGrok/);
  }
});

test("production origins and Clerk instance must agree", async () => {
  const provider = await fs.readFile("app/clerk-provider.tsx", "utf8");
  const config = await fs.readFile("next.config.ts", "utf8");
  const layout = await fs.readFile("app/layout.tsx", "utf8");
  assert.match(provider, /must identify the same Clerk instance/);
  assert.match(provider, /clerk\.sneaksolve\.com/);
  assert.match(config, /www\.sneaksolve\.com/);
  assert.match(layout, /www\.sneaksolve\.com/);
});

test("the dynamic request nonce is passed to Clerk and required by the root layout", async () => {
  const provider = await fs.readFile("app/clerk-provider.tsx", "utf8");
  const layout = await fs.readFile("app/layout.tsx", "utf8");
  assert.match(provider, /nonce=\{nonce\}/);
  assert.match(layout, /headers\(\)/);
  assert.match(layout, /get\("x-nonce"\)/);
  assert.match(layout, /<SneakSolveClerkProvider nonce=\{nonce\}>/);
});

test("account routes are explicitly private and non-indexable", async () => {
  const config = await fs.readFile("next.config.ts", "utf8");
  for (const path of ["/account/:path*", "/sign-in/:path*", "/sign-up/:path*"]) {
    assert.match(config, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const file of [
    "app/account/layout.tsx",
    "app/sign-in/layout.tsx",
    "app/sign-up/layout.tsx",
  ]) {
    const source = await fs.readFile(file, "utf8");
    assert.match(source, /index:\s*false/);
    assert.match(source, /follow:\s*false/);
  }
});

test("inactive template authentication, mutation, and alternate-hosting scaffolding are absent", async () => {
  for (const path of [
    "app/chatgpt-auth.ts",
    "examples",
    "build",
    "db",
    "drizzle",
    "drizzle.config.ts",
    "vite.config.ts",
    "worker",
  ]) {
    await assert.rejects(fs.access(path));
  }
});

test("future billing boundary is documented as server-authoritative", async () => {
  const security = await fs.readFile("SECURITY.md", "utf8");
  for (const expected of [
    /verified token/i,
    /must not trust/i,
    /allowlisted\s+Lemon\s+Squeezy\s+variant ID/i,
    /raw request bytes/i,
    /idempotently/i,
    /final authority/i,
  ]) {
    assert.match(security, expected);
  }
});
