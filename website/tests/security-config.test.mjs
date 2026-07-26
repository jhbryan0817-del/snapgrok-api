import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("frontend configuration has no Clerk development-key fallback", async () => {
  const provider = await fs.readFile("app/clerk-provider.tsx", "utf8");
  assert.match(provider, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required/);
  assert.match(provider, /pk_live_/);
  assert.doesNotMatch(provider, /pk_test_/);
});

test("security headers include CSP, clickjacking, and MIME protections", async () => {
  const config = await fs.readFile("next.config.ts", "utf8");
  for (const expected of [
    "Content-Security-Policy",
    "frame-ancestors 'none'",
    "X-Content-Type-Options",
    "Strict-Transport-Security",
    "NEXT_PUBLIC_CLERK_FRONTEND_API_URL",
  ]) {
    assert.match(config, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(config, /accounts\.dev/);
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
