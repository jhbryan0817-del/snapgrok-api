import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const pricing = await readFile(
  new URL("../app/pricing/page.tsx", import.meta.url),
  "utf8",
);
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const footer = await readFile(
  new URL("../app/site-footer.tsx", import.meta.url),
  "utf8",
);

test("approved landing copy is present", () => {
  assert.match(page, /Fast\. Reliable\. Private\./);
  assert.match(page, /Ask in Silence/);
  assert.match(page, /Stay Focused/);
  assert.match(
    page,
    /SneakSolve analyzes on-screen multiple-choice questions and delivers[\s\S]*answers instantly, without pulling you away from your tab\./,
  );
  assert.match(page, /20k\+/);
  assert.match(page, /300k\+/);
  assert.match(page, /One answer found: option A/);
  assert.match(page, /Hover on the icon to see every correct option/);
  assert.match(page, /The answering process was interrupted/);
  assert.match(page, /Two capture modes\. Your shortcuts\./);
  assert.match(page, /Custom Instruction for AI/);
  assert.match(page, /sneaksolve-how-it-works\.png/);
  assert.match(page, /Receive your answers/);
  assert.ok(
    page.indexOf('id="why-sneaksolve"') < page.indexOf('id="features"'),
    "The answer-state section must appear immediately before the feature section.",
  );
});

test("removed placeholders and overlapping privacy copy are absent", () => {
  assert.doesNotMatch(page, /<footer/i);
  assert.doesNotMatch(page, /Demo video coming here/);
  assert.doesNotMatch(page, /Private processing/);
});

test("footer is included globally instead of being duplicated on the landing page", () => {
  assert.match(layout, /<SiteFooter \/>/);
  assert.match(footer, /<footer/);
});

test("pricing preview includes all three requested plans", () => {
  for (const expected of [
    "Free",
    "5 questions every day",
    "Plus",
    "US$5",
    "200 questions every month",
    "Ultra",
    "US$7",
    "300 questions every month",
    "Grok 4.5",
  ]) {
    assert.match(pricing, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(pricing, /Plan Upgrades/);
  assert.match(pricing, /Everything offered in the Free plan/);
  assert.match(pricing, /More flexible usage/);
  assert.match(pricing, /Secure test checkout is now available/);
  assert.match(pricing, /designated tester\s+accounts/);
});
