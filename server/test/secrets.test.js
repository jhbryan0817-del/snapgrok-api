import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("server source contains no local environment or credential-shaped secret", () => {
  for (const name of [".env", ".env.local", ".env.production"]) {
    assert.equal(existsSync(resolve(root, name)), false, `${name} must not exist`);
  }

  const secretPatterns = [
    /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/,
    /\bxai-[A-Za-z0-9_-]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]{16,}@/i,
  ];
  const ignored = new Set([
    ".git",
    ".npm-cache",
    "coverage",
    "node_modules",
  ]);
  for (const file of walk(root, ignored)) {
    if (/\.(?:gif|ico|jpe?g|png|webp|woff2?|zip)$/i.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const pattern of secretPatterns) {
      assert.doesNotMatch(source, pattern, `credential-shaped value in ${file}`);
    }
  }
});

function walk(directory, ignored) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignored.has(entry)) continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path, ignored));
    else files.push(path);
  }
  return files;
}
