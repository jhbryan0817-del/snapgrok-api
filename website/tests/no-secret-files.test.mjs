import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("package contains no local environment secret file", () => {
  for (const name of [".env", ".env.local", ".env.production", ".env.development"]) {
    assert.equal(existsSync(resolve(root, name)), false, `${name} must not be packaged`);
  }
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  assert.match(example, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_/);
  assert.doesNotMatch(example, /CLERK_SECRET_KEY|sk_(?:live|test)_|XAI_API_KEY/);
});

test("git ignores local secrets, build output, dependencies, caches, and logs", () => {
  const ignore = readFileSync(resolve(root, ".gitignore"), "utf8");
  for (const pattern of [".env.*", "node_modules/", ".next/", ".npm-cache/", "*.log"]) {
    assert.match(ignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(ignore, /!\.env\.example/);
});

test("tracked website source contains no credential-shaped secret values", () => {
  const secretPatterns = [
    /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/,
    /\bwhsec_[A-Za-z0-9_-]{16,}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  const ignoredDirectories = new Set([".git", ".next", ".npm-cache", "node_modules", "dist"]);
  for (const file of walk(root, ignoredDirectories)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of secretPatterns) {
      assert.doesNotMatch(source, pattern, `credential-shaped value found in ${file}`);
    }
  }
});

function walk(directory, ignoredDirectories) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path, ignoredDirectories));
    else if (!/\.(?:gif|ico|jpe?g|png|webp|woff2?|zip)$/i.test(entry)) files.push(path);
  }
  return files;
}
