import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("frontend configuration has no Clerk development-key fallback", async () => {
  const provider = await fs.readFile("app/clerk-provider.tsx", "utf8");
  assert.match(provider, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required/);
  assert.doesNotMatch(provider, /pk_test_/);
});

test("security headers include CSP, clickjacking, and MIME protections", async () => {
  const config = await fs.readFile("next.config.ts", "utf8");
  for (const expected of [
    "Content-Security-Policy",
    "frame-ancestors 'none'",
    "X-Content-Type-Options",
    "Strict-Transport-Security",
  ]) {
    assert.match(config, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("public pages use the SneakSolve product name", async () => {
  for (const file of [
    "app/page.tsx",
    "app/account/page.tsx",
    "app/auth-shell.tsx",
    "app/sign-in/page.tsx",
    "app/sign-up/page.tsx",
  ]) {
    const source = await fs.readFile(file, "utf8");
    assert.doesNotMatch(source, /SnapGrok/);
  }
});
