import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const extensionRoot = new URL("../../extension/", import.meta.url);

test("extension keeps the required generative-AI and sensitive-data notices", async () => {
  const [manifestText, popup] = await Promise.all([
    readFile(new URL("manifest.json", extensionRoot), "utf8"),
    readFile(new URL("popup.html", extensionRoot), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.match(manifest.description, /proposed answers generated with xAI Grok/i);
  assert.match(
    popup,
    /uses generative AI \(xAI Grok\) to generate proposed answers from submitted screenshots/i,
  );
  assert.match(
    popup,
    /Do not submit screenshots containing identifiable sensitive personal information or credentials\./,
  );
});

test("every extension result state uses the approved AI-generated action title", async () => {
  const worker = await readFile(
    new URL("service-worker.js", extensionRoot),
    "utf8",
  );

  for (const title of [
    "Zenaian - AI processing",
    "AI-generated result: inconclusive",
    "AI-generated answer: ${outcome.answers[0]}",
    "AI-generated answers: ${outcome.answers.join(\", \")}",
  ]) {
    assert.ok(worker.includes(title), `missing extension action title: ${title}`);
  }
  assert.match(worker, /chrome\.action\.setTitle\(\{ title: ACTION_TITLES\.processing \}\)/);
  assert.match(worker, /title: errorTitle \|\| titleForOutcome\(outcome\)/);
  assert.match(worker, /chrome\.action\.setTitle\(\{ title: ACTION_TITLES\.idle \}\)/);
});
