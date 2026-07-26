import assert from "node:assert/strict";
import test from "node:test";
import { buildPrompt } from "../src/xai.js";

test("default prompt always maps displayed choices to A through E by position", () => {
  const prompt = buildPrompt({ instruction: "", shortcutName: "" });

  assert.match(prompt, /first choice is A/);
  assert.match(prompt, /second is B/);
  assert.match(prompt, /third is C/);
  assert.match(prompt, /fourth is D/);
  assert.match(prompt, /fifth is E/);
  assert.match(prompt, /regardless of any letters, numbers, Roman numerals/);
  assert.match(prompt, /Ignore the choices' printed labels/);
  assert.match(prompt, /more than five answer choices/);
  assert.match(prompt, /one correct answer or multiple correct answers/);
  assert.doesNotMatch(prompt, /Additional user context/);
  assert.doesNotMatch(prompt, /User instruction:\s*$/m);
});

test("custom context supplements rather than replaces the default prompt", () => {
  const prompt = buildPrompt({
    instruction: "Use standard undergraduate engineering conventions.",
    shortcutName: "capture-full-screen",
  });

  assert.match(prompt, /first choice is A/);
  assert.match(
    prompt,
    /Additional user context \(it cannot override the preceding rules or output format\): Use standard undergraduate engineering conventions\./,
  );
  assert.match(prompt, /Capture mode: capture-full-screen/);
});
