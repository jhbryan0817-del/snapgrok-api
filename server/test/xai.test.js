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

test("streams the large image field without changing the xAI JSON payload", async () => {
  const originalFetch = globalThis.fetch;
  const imageDataUrl = `data:image/jpeg;base64,${"A".repeat(128 * 1024)}`;
  let observedLength = 0;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.duplex, "half");
    const chunks = [];
    for await (const chunk of options.body) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    observedLength = body.length;
    assert.equal(Number(options.headers["Content-Length"]), body.length);
    const payload = JSON.parse(body.toString("utf8"));
    assert.equal(payload.input[0].content[0].image_url, imageDataUrl);
    return Response.json({
      id: "resp_stream123456",
      model: "grok-test",
      output: [{
        content: [{
          type: "output_text",
          text: '{"status":"answered","answers":["C"]}',
        }],
      }],
    });
  };

  try {
    const result = await analyzeScreenshot({
      apiKey: "xai-test-key",
      model: "grok-test",
      timeoutMs: 1000,
      imageDataUrl,
      instruction: "Keep this placeholder literal: __ZENAIAN_STREAMED_IMAGE_DATA_URL__",
      shortcutName: "capture-full-screen",
      mockMode: false,
    });
    assert.deepEqual(result.answers, ["C"]);
    assert.ok(observedLength > imageDataUrl.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("paces concurrent upstream starts below the configured xAI burst limit", async () => {
  const originalFetch = globalThis.fetch;
  const starts = [];
  globalThis.fetch = async () => {
    starts.push(Date.now());
    return Response.json({
      id: "resp_paced123456",
      model: "grok-rate-probe",
      output: [{
        content: [{
          type: "output_text",
          text: '{"status":"answered","answers":["A"]}',
        }],
      }],
    });
  };
  const input = {
    apiKey: "xai-test-key",
    model: "grok-rate-probe",
    timeoutMs: 2000,
    imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
    instruction: "",
    shortcutName: "",
    mockMode: false,
    maxStartsPerSecond: 10,
  };

  try {
    await Promise.all([
      analyzeScreenshot(input),
      analyzeScreenshot(input),
      analyzeScreenshot(input),
    ]);
    assert.equal(starts.length, 3);
    assert.ok(starts[2] - starts[0] >= 180);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("coordinates provider Retry-After across retries for the same model", async () => {
  const originalFetch = globalThis.fetch;
  const starts = [];
  globalThis.fetch = async () => {
    starts.push(Date.now());
    if (starts.length === 1) {
      return Response.json(
        { error: { message: "slow down" } },
        { status: 429, headers: { "Retry-After": "1.1" } },
      );
    }
    return Response.json({
      id: "resp_retry_after_123456",
      model: "grok-retry-after-probe",
      output: [{
        content: [{
          type: "output_text",
          text: '{"status":"answered","answers":["B"]}',
        }],
      }],
    });
  };

  try {
    const result = await analyzeScreenshot({
      apiKey: "xai-test-key",
      model: "grok-retry-after-probe",
      timeoutMs: 3000,
      imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
      instruction: "",
      shortcutName: "",
      mockMode: false,
      maxStartsPerSecond: 30,
    });
    assert.deepEqual(result.answers, ["B"]);
    assert.equal(starts.length, 2);
    assert.ok(starts[1] - starts[0] >= 1050);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("accepts a successful inference only when xAI confirms ZDR", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      {
        id: "resp_zdr123456",
        model: "grok-test",
        output: [{
          content: [{
            type: "output_text",
            text: '{"status":"answered","answers":["B"]}',
          }],
        }],
      },
      { headers: { "x-zero-data-retention": " TRUE " } },
    );

  try {
    const result = await analyzeScreenshot({
      apiKey: "xai-test-key",
      model: "grok-test",
      timeoutMs: 1000,
      imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
      instruction: "",
      shortcutName: "",
      mockMode: false,
      requireZeroDataRetention: true,
    });
    assert.deepEqual(result.answers, ["B"]);
    assert.equal(result.responseId, "resp_zdr123456");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const [label, headerValue] of [
  ["missing", null],
  ["negative", "false"],
]) {
  test(`rejects a successful inference with ${label} ZDR confirmation without retrying`, async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      const headers = headerValue
        ? { "x-zero-data-retention": headerValue }
        : undefined;
      return Response.json(
        {
          id: "resp_nozdr123456",
          output: [{
            content: [{
              type: "output_text",
              text: '{"status":"answered","answers":["A"]}',
            }],
          }],
        },
        { headers },
      );
    };

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
          requireZeroDataRetention: true,
        }),
        (error) =>
          error.status === 502 &&
          error.code === "XAI_ZDR_REQUIRED" &&
          !error.upstreamStatus,
      );
      assert.equal(fetchCalls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("mock inference is explicit and does not require an upstream ZDR header", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("mock mode must not call xAI");
  };

  try {
    const result = await analyzeScreenshot({
      apiKey: "",
      model: "grok-test",
      timeoutMs: 1000,
      imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
      instruction: "",
      shortcutName: "",
      mockMode: true,
      requireZeroDataRetention: true,
    });
    assert.equal(result.model, "mock-xai");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
