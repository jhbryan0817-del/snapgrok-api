import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("landing page contains the approved two-step workflow", () => {
  const page = read("app/page.tsx");
  assert.match(page, /Press the shortcut/);
  assert.match(page, /Read the icon/);
  assert.doesNotMatch(page, /3\. Read the icon/);
  assert.match(page, /answer appears only in the extension icon/);
});

test("status icons and product illustration exist", () => {
  for (const name of [
    "default",
    "processing",
    "result-a",
    "result-multi",
    "result-inconclusive",
    "result-error",
  ]) {
    assert.equal(
      existsSync(resolve(root, `public/sneaksolve-icons/${name}.png`)),
      true,
      `${name}.png missing`,
    );
  }
  assert.equal(existsSync(resolve(root, "public/sneaksolve-how-it-works.png")), true);
});

test("approved red and yellow icon files are referenced", () => {
  const page = read("app/page.tsx");
  assert.match(page, /result-inconclusive\.png/);
  assert.match(page, /result-error\.png/);
});

test("authentication and synchronization configuration remains intact", () => {
  const provider = read("app/clerk-provider.tsx");
  const config = read("next.config.ts");
  assert.match(provider, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(provider, /afterSignOutUrl="\/"/);
  assert.match(config, /NEXT_PUBLIC_CLERK_FRONTEND_API_URL/);
  assert.match(config, /Content-Security-Policy/);
});

test("global header and footer remain present", () => {
  assert.match(read("app/page.tsx"), /<SiteHeader \/>/);
  assert.match(read("app/layout.tsx"), /<SiteFooter \/>/);
});
