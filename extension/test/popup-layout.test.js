"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const EXTENSION_ROOT = path.join(__dirname, "..");
const popupHtml = read("popup.html");
const popupCss = read("popup.css");
const instructionCss = read("instruction.css");

test("account plan appears above the signed-in identity and account link", () => {
  const planPosition = popupHtml.indexOf('class="account-meta"');
  const identityPosition = popupHtml.indexOf('class="account-identity"');

  assert.ok(planPosition >= 0);
  assert.ok(identityPosition > planPosition);
  assert.match(popupHtml, /Signed in as[\s\S]*id="accountEmail"[\s\S]*id="manageAccount"/);
});

test("toolbar legend is titleless and its container is transparent", () => {
  assert.doesNotMatch(popupHtml, /Toolbar results/i);
  assert.match(popupHtml, /class="result-card" aria-label="Toolbar result legend"/);
  assert.match(popupCss, /\.result-card \{ margin-top: 8px; padding: 3px 4px 0; \}/);
  assert.doesNotMatch(popupCss, /\.result-heading/);
});

test("popup is non-scrollable and all extension pages use real Aileron weights", () => {
  assert.match(popupCss, /html \{ overflow: hidden; \}/);
  assert.match(popupCss, /body \{[\s\S]*?overflow: hidden;/);

  for (const css of [popupCss, instructionCss]) {
    assert.match(css, /Aileron-Regular\.otf/);
    assert.match(css, /Aileron-Bold\.otf/);
    assert.match(css, /font-family: "Aileron", Arial, sans-serif;/);
    assert.match(css, /font-synthesis: none;/);
    assert.doesNotMatch(css, /font-weight: (?:600|750|800|900)/);
  }
});

function read(fileName) {
  return fs.readFileSync(path.join(EXTENSION_ROOT, fileName), "utf8");
}
