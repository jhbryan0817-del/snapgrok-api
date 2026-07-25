import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("approved landing copy is present", () => {
  assert.match(page, /Capture in silence/);
  assert.match(page, /10k\+/);
  assert.match(page, /100k\+/);
  assert.match(page, /One answer found: option A/);
  assert.match(page, /Hover on the icon to expand the list of correct options/);
  assert.match(page, /Answering process was interrupted/);
});

test("removed landing sections and footer are absent", () => {
  assert.doesNotMatch(page, /<footer/i);
  assert.doesNotMatch(page, />Use Cases</);
  assert.doesNotMatch(page, />FAQ</);
});
