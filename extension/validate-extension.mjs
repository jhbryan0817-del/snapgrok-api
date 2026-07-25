import assert from "node:assert/strict";
import fs from "node:fs/promises";

const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));
const authConfig = await fs.readFile("auth-config.js", "utf8");
const authBundle = await fs.readFile("clerk-auth.js", "utf8");

assert.equal(manifest.name, "SneakSolve MCQ Assistant");
assert.equal(manifest.version, "5.0.3");
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
  "https://www.sneaksolve.com/*",
]);
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
