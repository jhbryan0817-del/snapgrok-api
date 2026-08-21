"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const EXTENSION_ROOT = path.join(__dirname, "..");
const popupHtml = read("popup.html");
const popupCss = read("popup.css");
const instructionCss = read("instruction.css");

test("account header follows the plan, identity, and bordered action layout", () => {
  const planPosition = popupHtml.indexOf('class="account-meta"');
  const identityPosition = popupHtml.indexOf('class="account-identity"');
  const actionPosition = popupHtml.indexOf('class="manage-account"');

  assert.ok(planPosition >= 0);
  assert.ok(identityPosition > planPosition);
  assert.ok(actionPosition > identityPosition);
  assert.match(popupHtml, /class="plan-chip"[\s\S]*Signed in as[\s\S]*id="accountEmail"/);
  assert.match(popupHtml, /class="identity-icon"/);
  assert.match(popupCss, /\.manage-account \{[\s\S]*?border: 1px solid var\(--accent\);/);
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
