import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const heroDemo = await readFile(
  new URL("../app/hero-browser-demo.tsx", import.meta.url),
  "utf8",
);
const answerToolbar = await readFile(
  new URL("../app/answer-toolbar-demo.tsx", import.meta.url),
  "utf8",
);
const workflowPreferences = await readFile(
  new URL("../app/workflow-preferences-demo.tsx", import.meta.url),
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
  assert.match(page, /Install Zenaian/);
  assert.match(
    page,
    /Analyze on-screen multiple-choice questions with Zenaian[\s\S]*Get accurate answers instantly without leaving your tab\./,
  );
  assert.match(page, /Trusted by 20,000\+ Users/);
  assert.doesNotMatch(page, /Active Users|Questions Solved|stats-panel/);
  assert.match(answerToolbar, /One clear answer was found/);
  assert.match(answerToolbar, /Explore aspects of Zenaian before you get started\./);
  assert.match(answerToolbar, /answer-toolbar-readout.*is-default/);
  assert.match(answerToolbar, /activeId === null/);
  assert.match(answerToolbar, /More than one answer was found\. Hover on the extension icon for details/);
  assert.match(answerToolbar, /The image does not contain appropriate information for a reliable answer/);
  assert.match(answerToolbar, /The answering process was interrupted/);
  assert.match(page, /Two capture modes\. Your shortcuts\./);
  assert.match(workflowPreferences, /Custom Instruction for AI/);
  assert.match(workflowPreferences, /<select/);
  assert.match(workflowPreferences, /Capture visible tab" initialKey="Z"/);
  assert.match(workflowPreferences, /<textarea/);
  assert.match(workflowPreferences, /type="submit">Save/);
  assert.match(workflowPreferences, /nothing is sent or stored/);
  assert.match(page, /<HeroBrowserDemo \/>/);
  assert.match(heroDemo, /What is known as the powerhouse of the cell\?/);
  assert.match(heroDemo, /zenaian\.com\/use-example/);
  assert.match(heroDemo, /demo-key-control/);
  assert.match(heroDemo, /demo-key-shift/);
  assert.match(heroDemo, /demo-key-z/);
  assert.match(heroDemo, /Control Shift Z keyboard shortcut/);
  assert.match(heroDemo, /toolbar-icon-processing/);
  assert.match(heroDemo, /toolbar-icon-answer">B/);
  assert.match(heroDemo, /no screen-swiping animation in real use/);
  assert.doesNotMatch(heroDemo, /Answer confirmed|demo-confirmation|toolbar-confirmation-pulse/);
  assert.equal((page.match(/hero-copy-divider/g) ?? []).length, 1);
  assert.doesNotMatch(page, /BUILT AROUND YOUR WORKFLOW|Explore Zenaian before you begin|Choose how you capture|Receive your answers|Select or hover over an icon state|Comprehensive Customizability/);
  assert.match(page, /<AnswerToolbarDemo \/>/);
  assert.doesNotMatch(page, /feature-number/);
  assert.match(answerToolbar, /zenaian\.com\/icons-explanation/);
  assert.match(page, /Accelerate Test Preparation/);
  assert.doesNotMatch(page, /Accelerate Test Preparation\./);
  assert.match(page, /Eliminate unnecessary steps - maximize your learning efficiency/);
  assert.doesNotMatch(page, /Capture the question and confirm the answer without switching/);
  assert.match(page, /flowchart-lines[\s\S]*Screenshot[\s\S]*Switch screen[\s\S]*Paste and ask[\s\S]*Confirm[\s\S]*Return/);
  assert.match(page, /flowchart-path-zenaian[\s\S]*Capture[\s\S]*Confirm/);
  assert.match(page, /Powered by Grok 4\.5/);
  assert.match(page, /Zenaian promises accurate, instant answers from the highest-grade AI model/);
  assert.match(page, /benchmark-speed-badge/);
  assert.match(page, /privacy-heading[\s\S]*<LockIcon \/>[\s\S]*Privacy &amp; Security/);
  assert.match(page, /study-intelligence-panel[\s\S]*study-speed-card[\s\S]*study-model-card/);
  assert.match(page, /SWE Marathon/);
  assert.match(page, /benchmark-visual benchmark-visual-duo/);
  assert.match(page, /Response speed/);
  assert.match(page, /not endorsed by xAI/);
  assert.ok(
    page.indexOf("<AnswerToolbarDemo />") < page.indexOf('className="feature-grid explore-controls-grid"'),
    "The answer-state toolbar and workflow controls must share the merged explore section.",
  );
  assert.ok(
    page.indexOf('className="hero-description"') < page.indexOf("<HeroBrowserDemo />") &&
      page.indexOf("<HeroBrowserDemo />") < page.indexOf('className="hero-followup'),
    "The hero demo must sit between the supporting copy and the actions.",
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
  assert.match(pricing, /SIMPLE PRICING/);
  assert.match(pricing, /Plan Upgrades/);
  assert.doesNotMatch(pricing, /Choose Your Plan|Pick What Suits You|Start with five questions a day/);
  assert.match(pricing, /Everything offered in the Free plan/);
  assert.match(pricing, /More flexible usage/);
  assert.doesNotMatch(pricing, /Secure checkout powered by Whop|One paid plan can be active per account|pricing-launch-note/);
});
