import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("package contains no local environment secret file", () => {
  assert.equal(existsSync(resolve(root, ".env.local")), false);
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  assert.match(example, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_/);
  assert.doesNotMatch(example, /CLERK_SECRET_KEY|sk_(?:live|test)_|XAI_API_KEY/);
});
