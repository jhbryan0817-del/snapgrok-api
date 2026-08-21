"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const EXTENSION_ROOT = path.join(__dirname, "..");
const popupHtml = read("popup.html");
const popupCss = read("popup.css");
const popupJs = read("popup.js");
const instructionCss = read("instruction.css");

test("signed-out header fills the account space with the Zenaian product identity", () => {
  assert.match(popupHtml, /<header class="app-header is-signed-out">/);
  assert.match(popupHtml, /id="brandIntro"[\s\S]*?<h1>Zenaian<\/h1>[\s\S]*?<p>AI MCQ Assistant<\/p>/);
  assert.match(popupCss, /\.signed-out-brand \{[\s\S]*?grid-column: 3;[\s\S]*?grid-row: 1;/);
  assert.match(popupCss, /\.app-header\.is-signed-out \{[\s\S]*?grid-template-columns: 58px max-content;[\s\S]*?column-gap: 6px;[\s\S]*?min-height: 70px;[\s\S]*?margin-bottom: 4px;[\s\S]*?padding: 6px 14px;[\s\S]*?justify-content: start;[\s\S]*?border-color: transparent;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
  assert.match(popupCss, /\.app-header\.is-signed-out \.signed-out-brand \{ grid-column: 2; \}/);
  assert.match(popupJs, /elements\.appHeader\.classList\.toggle\("is-signed-out", !snapshot\.isSignedIn\);/);
  assert.match(popupJs, /elements\.brandIntro\.hidden = snapshot\.isSignedIn;/);
});

test("account action is comfortably compact, icon-led, and aligned with the email row", () => {
  const planPosition = popupHtml.indexOf('class="account-meta"');
  const identityPosition = popupHtml.indexOf('class="identity-icon"');
  const actionPosition = popupHtml.indexOf('class="manage-account"');

  assert.ok(planPosition >= 0);
  assert.ok(identityPosition > planPosition);
  assert.ok(actionPosition > identityPosition);
  assert.match(popupHtml, /class="plan-chip"[\s\S]*Signed in as[\s\S]*id="accountEmail"[\s\S]*id="manageAccount"/);
  assert.match(popupHtml, /class="identity-icon"/);
  assert.match(popupHtml, /id="manageAccount"[\s\S]*?<svg[\s\S]*?<circle[\s\S]*?>Manage account<\/span>/);
  assert.match(popupCss, /\.account-email \{[\s\S]*?grid-row: 3;[\s\S]*?align-self: center;/);
  assert.match(popupCss, /\.manage-account \{[\s\S]*?min-height: 28px;[\s\S]*?grid-row: 3;[\s\S]*?align-self: center;[\s\S]*?padding: 4px 8px;[\s\S]*?transform: translateY\(-1px\);/);
  assert.match(popupCss, /\.manage-account svg \{[\s\S]*?width: 15px;[\s\S]*?height: 15px;/);
  assert.match(popupCss, /\.account-prefix \{[^}]*transform: translateY\(5px\);/);
  assert.match(popupCss, /\.account-meta \{[^}]*margin-bottom: 1px;/);
});

test("capture shortcuts share one edit action and sit on divided white rows", () => {
  const captureMarkup = popupHtml.match(/<section class="section-block capture-section"[\s\S]*?<\/section>/)?.[0] || "";

  assert.match(captureMarkup, /id="editShortcuts"[\s\S]*>Edit<\/button>/);
  assert.doesNotMatch(captureMarkup, /Choose and set how you want to capture|id="captureHeading"/);
  assert.doesNotMatch(captureMarkup, /id="assign(?:Full|Zone)"|>Change<\/button>/);
  assert.doesNotMatch(popupJs, /assignFull|assignZone/);
  assert.match(popupJs, /elements\.editShortcuts\.addEventListener\("click", openShortcutManager\)/);
  assert.match(popupCss, /\.capture-card \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(popupCss, /\.capture-card \{[\s\S]*?grid-template-columns: 38px 168px auto;[\s\S]*?justify-content: start;[\s\S]*?gap: 14px;/);
  assert.match(popupCss, /\.capture-edit \{ position: absolute; top: 10px; right: 14px;/);
  assert.match(popupCss, /\.capture-card \+ \.capture-card \{[\s\S]*?border-top: 1px solid #e4e7ee;/);
});

test("custom instruction heading matches the capture-label emphasis", () => {
  assert.match(popupCss, /\.capture-copy h3 \{[^}]*font-weight: 600;/);
  assert.match(popupCss, /\.instruction-copy h2 \{[^}]*font-weight: 600;/);
});

test("toolbar legend uses five background-free glyphs", () => {
  const resultMarkup = popupHtml.match(/<section class="result-card"[\s\S]*?<\/section>/)?.[0] || "";

  assert.doesNotMatch(popupHtml, /Toolbar results/i);
  assert.match(popupHtml, /class="result-card" aria-label="Toolbar result legend"/);
  assert.match(popupCss, /\.result-card \{ margin-top: 8px; padding: 3px 4px 0; \}/);
  assert.equal((resultMarkup.match(/class="result-glyph/g) || []).length, 5);
  assert.doesNotMatch(resultMarkup, /<img/);
  assert.match(popupCss, /\.result-glyph \{[\s\S]*?background: transparent;/);
  assert.doesNotMatch(popupCss, /\.result-heading/);
});

test("popup is non-scrollable and extension pages use the technical system font stack", () => {
  assert.match(popupCss, /html \{ overflow: hidden; \}/);
  assert.match(popupCss, /body \{[\s\S]*?overflow: hidden;/);

  for (const css of [popupCss, instructionCss]) {
    assert.match(css, /font-family: "Segoe UI Variable", Aptos, "Segoe UI", Arial, sans-serif;/);
    assert.match(css, /font-synthesis: none;/);
    assert.doesNotMatch(css, /Aileron/);
  }
});

function read(fileName) {
  return fs.readFileSync(path.join(EXTENSION_ROOT, fileName), "utf8");
}
