import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";

const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));
const authConfig = await fs.readFile("auth-config.js", "utf8");
const authBundleBytes = await fs.readFile("clerk-auth.js");
const authBundle = authBundleBytes.toString("utf8");
const serviceWorker = await fs.readFile("service-worker.js", "utf8");
const popupHtml = await fs.readFile("popup.html", "utf8");
const instructionEditor = await fs.readFile("instruction.js", "utf8");
const zoneSelector = await fs.readFile("zone-selector.js", "utf8");

assert.equal(manifest.name, "SneakSolve MCQ Assistant");
assert.equal(manifest.version, "5.1.7");
assert.equal("content_scripts" in manifest, false);
assert.equal(manifest.permissions.includes("tabs"), false);
assert.equal(manifest.permissions.includes("cookies"), true);
assert.equal(
  manifest.permissions.includes("declarativeNetRequestWithHostAccess"),
  true,
);
assert.equal(
  manifest.host_permissions.some((origin) => origin.includes("localhost")),
  false,
);
assert.deepEqual(manifest.host_permissions, [
  "https://snapgrok-api.onrender.com/*",
  "https://clerk.sneaksolve.com/*",
]);
assert.deepEqual(manifest.externally_connectable, {
  matches: ["https://www.sneaksolve.com/*"],
});
assert.match(
  authConfig,
  /"publishableKey": "pk_live_Y2xlcmsuc25lYWtzb2x2ZS5jb20k"/,
);
assert.match(
  authConfig,
  /"frontendApiUrl": "https:\/\/clerk\.sneaksolve\.com"/,
);
assert.match(
  authConfig,
  /"websiteUrl": "https:\/\/www\.sneaksolve\.com"/,
);
assert.match(
  authConfig,
  /"syncHost": "https:\/\/clerk\.sneaksolve\.com"/,
);
assert.doesNotMatch(authConfig, /pk_test_|accounts\.dev|localhost/);
const settings = await fs.readFile("settings.js", "utf8");
assert.match(settings, /storage\.local\.setAccessLevel/);
assert.match(settings, /accessLevel:\s*"TRUSTED_CONTEXTS"/);

const encodedKey = authConfig.match(/"publishableKey": "pk_live_([^"]+)"/)?.[1];
assert.ok(encodedKey);
assert.equal(
  Buffer.from(encodedKey, "base64").toString("utf8").replace(/\$$/, ""),
  "clerk.sneaksolve.com",
);
assert.match(authBundle, /hasSyncCookie/);
assert.match(authBundle, /syncCookiePresent/);
assert.match(authBundle, /SneakSolve user/);
assert.match(authBundle, /declarativeNetRequest/);
assert.match(authBundle, /_is_native=1/);
assert.match(authBundle, /Origin/);
assert.doesNotMatch(authBundle, /@clerk\/ui\/no-rhc/);
assert.equal(
  createHash("sha256").update(authBundleBytes).digest("hex"),
  "fe5acff370fc5812320dfe02db9c063d76964643bbc11104d8469faa34e7c091",
  "The reviewed Clerk extension bundle changed; rebuild and re-audit it before release.",
);
assert.match(serviceWorker, /STANDARD_RESULT_DISPLAY_MS = 4000/);
assert.match(serviceWorker, /MULTIPLE_RESULT_DISPLAY_MS = 6000/);
const externalHandlerStart = serviceWorker.indexOf(
  "chrome.runtime.onMessageExternal.addListener",
);
const internalHandlerStart = serviceWorker.indexOf(
  "chrome.runtime.onMessage.addListener",
  externalHandlerStart,
);
assert.ok(externalHandlerStart >= 0);
assert.ok(internalHandlerStart > externalHandlerStart);
const externalHandler = serviceWorker.slice(
  externalHandlerStart,
  internalHandlerStart,
);
assert.match(externalHandler, /SNEAKSOLVE_EXTENSION_PING/);
assert.match(externalHandler, /senderOrigin !== WEBSITE_ORIGIN/);
assert.match(externalHandler, /installed:\s*true/);
assert.doesNotMatch(
  externalHandler,
  /authToken|getSessionToken|captureVisibleTab|storage|cookies/,
);
assert.match(serviceWorker, /requestBody:\s*\{[\s\S]*operationId,/);
assert.match(serviceWorker, /titleForSystemError/);
const offscreenWorker = await fs.readFile("offscreen.js", "utf8");
assert.match(offscreenWorker, /QUOTA_EXHAUSTED/);
assert.match(offscreenWorker, /BILLING_DATABASE_UNAVAILABLE/);
assert.match(serviceWorker, /isBrowserRestrictedPage/);
assert.match(serviceWorker, /Use full-screen capture instead/);
assert.match(zoneSelector, /if \(!dialog\.open\)/);
assert.match(zoneSelector, /Selector probe differed; continuing/);
assert.match(zoneSelector, /selectorMatchesModalState/);
assert.match(zoneSelector, /selectorFillsViewport/);
assert.match(zoneSelector, /__sneaksolveV512ZoneListenerInstalled/);
assert.match(zoneSelector, /SNAPGROK_START_ZONE_SELECTOR_V512/);
assert.match(serviceWorker, /SNAPGROK_START_ZONE_SELECTOR_V512/);
assert.match(serviceWorker, /SNAPGROK_STOP_ZONE_SELECTOR_V512/);
assert.doesNotMatch(
  zoneSelector,
  /!dialog\.matches\(":modal"\)\s*\|\|/,
);
assert.doesNotMatch(
  zoneSelector,
  /rect\.width\s*<[\s\S]{0,160}throw new Error\("Chrome did not place/,
);
assert.doesNotMatch(serviceWorker, /No instruction has been saved/);
assert.doesNotMatch(instructionEditor, /Add an instruction before saving/);
assert.match(popupHtml, />Add Context</);
assert.match(popupHtml, />Custom Instruction for AI</);

const toolbarResultAssets = [
  "icons/result-a32.png",
  "icons/result-multi-232.png",
  "icons/processing32.png",
  "icons/result-inconclusive32.png",
  "icons/result-error32.png",
];
let previousToolbarAssetIndex = -1;
for (const asset of toolbarResultAssets) {
  const assetIndex = popupHtml.indexOf(asset);
  assert.ok(assetIndex > previousToolbarAssetIndex, `${asset} is out of order`);
  previousToolbarAssetIndex = assetIndex;
}
for (const label of [
  "Single answer",
  "Multiple answers",
  "Processing",
  "Inconclusive",
  "Error",
]) {
  assert.match(popupHtml, new RegExp(`>${label}<`));
}
assert.doesNotMatch(popupHtml, /<span>(?:Single|Multiple|Unclear|Working)<\/span>/);

const expectedProcessingAssets = new Map([
  ["icons/processing16.png", "5dbaab3ad365e2142a78d1470ff54c84edd2ea316e4432038e4ac827f4fe8124"],
  ["icons/processing32.png", "bff97760f9c0444b5c1f754de640b5f347e364e8295db4cb14a7bdec5cf7297c"],
  ["icons/processing48.png", "41a46e81fee6a3262041385a5ac6ea5f723b72d838701758a29b3791b428cef9"],
  ["icons/processing128.png", "b0d397541ee879fa2b02dbe9a3aea2b89e72331dbca8d05db4215a49b7521299"],
]);
for (const [path, expectedHash] of expectedProcessingAssets) {
  const bytes = await fs.readFile(path);
  const expectedSize = Number(path.match(/(\d+)\.png$/)?.[1]);
  assert.equal(bytes.readUInt32BE(16), expectedSize, `${path} width changed`);
  assert.equal(bytes.readUInt32BE(20), expectedSize, `${path} height changed`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expectedHash,
    `${path} no longer contains the reviewed square processing artwork`,
  );
}

for (const file of [
  "popup.html",
  "instruction.html",
  "offscreen.html",
  "offscreen.js",
]) {
  const source = await fs.readFile(file, "utf8");
  assert.doesNotMatch(source, /SnapGrok/);
}

for (const htmlFile of ["popup.html", "instruction.html", "offscreen.html"]) {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
}

console.log("SneakSolve extension validation passed.");
