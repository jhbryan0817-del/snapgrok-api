import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("package contains no local environment secret file", () => {
  assert.equal(existsSync(resolve(root, ".env.local")), false);
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  assert.match(example, /REPLACE_WITH_EXISTING_KEY/);
  assert.doesNotMatch(example, /pk_live_[A-Za-z0-9]{20,}/);
});
