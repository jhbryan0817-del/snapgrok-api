import assert from "node:assert/strict";
import fs from "node:fs/promises";

const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));
const authConfig = await fs.readFile("auth-config.js", "utf8");

assert.equal(manifest.name, "SneakSolve MCQ Assistant");
assert.equal(manifest.version, "5.0.0");
assert.equal("content_scripts" in manifest, false);
assert.equal(manifest.permissions.includes("tabs"), false);
assert.equal(
  manifest.host_permissions.some((origin) => origin.includes("localhost")),
  false,
);
assert.match(authConfig, /"websiteUrl": "https:\/\/sneaksolve\.com"/);
assert.doesNotMatch(authConfig, /"websiteUrl": "http:/);

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
