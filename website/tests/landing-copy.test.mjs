import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const heroDemo = await readFile(
  new URL("../app/hero-browser-demo.tsx", import.meta.url),
  "utf8",
);
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
  assert.match(page, /#1 AI-Powered MCQ Assistant Tool/);
  assert.match(page, /Ask in Silence/);
  assert.match(page, /Stay Focused/);
  assert.match(page, /Get Zenaian/);
  assert.match(
    page,
    /Analyze on-screen multiple-choice questions with Zenaian[\s\S]*Get accurate answers instantly without leaving your tab\./,
  );
  assert.match(page, /Trusted by 20k\+ Active Subscribers/);
  assert.doesNotMatch(page, /Active Users|Questions Solved|stats-panel/);
  assert.match(page, /One answer found: option A/);
  assert.match(page, /Hover on the icon to see every correct option/);
  assert.match(page, /The answering process was interrupted/);
  assert.match(page, /Two capture modes\. Your shortcuts\./);
  assert.match(page, /Custom Instruction for AI/);
  assert.match(page, /<HeroBrowserDemo \/>/);
  assert.match(heroDemo, /Which organelle produces most of the cell/);
  assert.match(heroDemo, /demo-key-control/);
  assert.match(heroDemo, /demo-key-shift/);
  assert.match(heroDemo, /demo-key-a/);
  assert.match(heroDemo, /toolbar-icon-processing/);
  assert.match(heroDemo, /toolbar-icon-answer">B/);
  assert.match(page, /hero-copy-divider/);
  assert.match(page, /Receive your answers/);
  assert.match(page, /Simplify studying\. Prepare for tests faster\./);
  assert.match(page, /Psychology/);
  assert.match(page, /Law/);
  assert.match(page, /Anatomy/);
  assert.match(page, /Screenshot[\s\S]*Switch Screen[\s\S]*Paste and Ask[\s\S]*Confirm[\s\S]*Return/);
  assert.match(page, /Capture[\s\S]*Confirm/);
  assert.match(page, /Powered by Grok 4\.5\./);
  assert.match(page, /one of the frontier and most capable AI models available/);
  assert.match(page, /not affiliated with or[\s\S]*endorsed by xAI/);
  assert.ok(
    page.indexOf('id="receive-answers"') < page.indexOf('id="features"'),
    "The answer-state section must appear immediately before the feature section.",
  );
  assert.match(page, /href="#receive-answers">Explore features/);
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
  assert.match(pricing, /Secure checkout powered by Whop/);
  assert.match(pricing, /One paid plan can be active per account/);
});
