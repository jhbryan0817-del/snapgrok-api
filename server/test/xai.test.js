import assert from "node:assert/strict";
import test from "node:test";
import { analyzeScreenshot, buildPrompt } from "../src/xai.js";

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

test("maps upstream credential failures to a redacted gateway error class", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "provider detail must stay internal" } }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );

  try {
    await assert.rejects(
      analyzeScreenshot({
        apiKey: "xai-test-key",
        model: "grok-test",
        timeoutMs: 1000,
        imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
        instruction: "",
        shortcutName: "",
        mockMode: false,
      }),
      (error) =>
        error.status === 502 &&
        error.code === "XAI_CREDENTIALS_REJECTED" &&
        error.upstreamStatus === 401,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects oversized upstream responses before buffering them", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("{}", {
      status: 200,
      headers: { "Content-Length": String(1024 * 1024 + 1) },
    });

  try {
    await assert.rejects(
      analyzeScreenshot({
        apiKey: "xai-test-key",
        model: "grok-test",
        timeoutMs: 1000,
        imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
        instruction: "",
        shortcutName: "",
        mockMode: false,
      }),
      (error) =>
        error.status === 502 && error.code === "XAI_RESPONSE_TOO_LARGE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enforces one overall xAI deadline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted.", "AbortError")),
        { once: true },
      );
    });

  try {
    const startedAt = Date.now();
    await assert.rejects(
      analyzeScreenshot({
        apiKey: "xai-test-key",
        model: "grok-test",
        timeoutMs: 25,
        imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
        instruction: "",
        shortcutName: "",
        mockMode: false,
      }),
      (error) => error.status === 504 && error.code === "XAI_TIMEOUT",
    );
    assert.ok(Date.now() - startedAt < 250);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
