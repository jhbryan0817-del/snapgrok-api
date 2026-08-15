import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisJobManager } from "../src/analysis-jobs.js";
import { UserRateLimiter } from "../src/rate-limit.js";

const AUTH = {
  userId: "user_abcdef12345",
  sessionId: "sess_abcdef12345",
  deviceSessionId: "device-1",
};

test("analysis jobs return quickly, poll to completion, and clear screenshot data", async () => {
  const calls = [];
  const billing = billingStub(calls);
  const body = validBody();
  const manager = createAnalysisJobManager({
    analyze: async ({
      imageDataUrl,
      instruction,
      requireZeroDataRetention,
      signal,
    }) => {
      assert.equal(signal.aborted, false);
      assert.match(imageDataUrl, /^data:image\/jpeg;base64,/);
      assert.equal(instruction, "context");
      assert.equal(requireZeroDataRetention, true);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { status: "answered", answers: ["A"] };
    },
    billingService: billing,
    userRateLimiter: limiterStub(calls, "user"),
    globalRequestLimiter: limiterStub(calls, "global"),
    config: config(),
    randomUUIDFn: () => "00000000-0000-4000-8000-000000000001",
  });

  const created = await manager.create({ auth: AUTH, body, requestId: "request-1" });
  assert.equal(created.status, "processing");
  assert.equal(manager.get({ jobId: created.jobId, auth: AUTH }).httpStatus, 202);
  await waitFor(() => {
    try {
      return manager.get({ jobId: created.jobId, auth: AUTH }).httpStatus === 200;
    } catch {
      return false;
    }
  });
  const completed = manager.get({ jobId: created.jobId, auth: AUTH });
  assert.deepEqual(completed.payload.answers, ["A"]);
  assert.equal(body.imageDataUrl, "");
  assert.equal(body.instruction, "");
  assert.deepEqual(calls, [
    "global:acquire",
    "user:acquire",
    "reserve",
    "consume",
    "user:release",
    "global:release",
  ]);
});

test("only the creating extension device can poll a job", async () => {
  const manager = createAnalysisJobManager({
    analyze: async () => new Promise(() => {}),
    billingService: billingStub([]),
    userRateLimiter: limiterStub([], "user"),
    globalRequestLimiter: limiterStub([], "global"),
    config: config(),
    randomUUIDFn: () => "00000000-0000-4000-8000-000000000002",
  });
  const created = await manager.create({ auth: AUTH, body: validBody(), requestId: "request-2" });
  assert.throws(
    () => manager.get({
      jobId: created.jobId,
      auth: { ...AUTH, deviceSessionId: "device-2" },
    }),
    (error) => error.code === "ANALYSIS_JOB_NOT_FOUND",
  );
  manager.close();
});

test("cancellation aborts inference and releases reserved quota", async () => {
  const calls = [];
  const manager = createAnalysisJobManager({
    analyze: ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
    billingService: billingStub(calls),
    userRateLimiter: limiterStub(calls, "user"),
    globalRequestLimiter: limiterStub(calls, "global"),
    config: config(),
    randomUUIDFn: () => "00000000-0000-4000-8000-000000000003",
  });
  const created = await manager.create({ auth: AUTH, body: validBody(), requestId: "request-3" });
  assert.deepEqual(manager.cancel({ jobId: created.jobId, auth: AUTH }), {
    cancelled: true,
  });
  await waitFor(() => calls.includes("release"));
  assert.throws(
    () => manager.get({ jobId: created.jobId, auth: AUTH }),
    (error) => error.code === "ANALYSIS_JOB_CANCELLED" && error.status === 410,
  );
  assert.equal(calls.includes("consume"), false);
});

test("analysis jobs reuse the single global protected-api limiter bucket", async () => {
  const globalLimiter = new UserRateLimiter({
    windowMs: 60000,
    maxRequests: 20,
    maxConcurrent: 4,
    maxTrackedUsers: 1,
    scope: "global",
  });
  const releaseEarlierProtectedRequest = globalLimiter.acquire("protected-api");
  releaseEarlierProtectedRequest();

  const manager = createAnalysisJobManager({
    analyze: async () => ({ status: "answered", answers: ["A"] }),
    billingService: billingStub([]),
    userRateLimiter: limiterStub([], "user"),
    globalRequestLimiter: globalLimiter,
    config: config(),
    randomUUIDFn: () => "00000000-0000-4000-8000-000000000004",
  });

  const created = await manager.create({
    auth: AUTH,
    body: validBody(),
    requestId: "request-4",
  });
  assert.equal(created.status, "processing");
  await waitFor(() => {
    try {
      return manager.get({ jobId: created.jobId, auth: AUTH }).httpStatus === 200;
    } catch {
      return false;
    }
  });
});

test("account deletion immediately removes terminal results and scrubs active request bodies", async () => {
  let resolveSecond;
  let call = 0;
  const manager = createAnalysisJobManager({
    analyze: async ({ signal }) => {
      call += 1;
      if (call === 1) return { status: "answered", answers: ["B"] };
      return new Promise((resolve, reject) => {
        resolveSecond = resolve;
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
    billingService: billingStub([]),
    userRateLimiter: limiterStub([], "user"),
    globalRequestLimiter: limiterStub([], "global"),
    config: config(),
    randomUUIDFn: (() => {
      let suffix = 10;
      return () => `00000000-0000-4000-8000-${String(suffix++).padStart(12, "0")}`;
    })(),
  });
  const first = await manager.create({ auth: AUTH, body: validBody(), requestId: "delete-1" });
  await waitFor(() => {
    try { return manager.get({ jobId: first.jobId, auth: AUTH }).httpStatus === 200; }
    catch { return false; }
  });
  const activeBody = validBody();
  const second = await manager.create({ auth: AUTH, body: activeBody, requestId: "delete-2" });

  assert.equal(manager.cancelForUser(AUTH.userId, "Account deletion"), 2);
  assert.equal(activeBody.imageDataUrl, "");
  assert.equal(activeBody.instruction, "");
  for (const jobId of [first.jobId, second.jobId]) {
    assert.throws(
      () => manager.get({ jobId, auth: AUTH }),
      (error) => error.code === "ANALYSIS_JOB_NOT_FOUND",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveSecond?.();
});

function validBody() {
  return {
    operationId: "00000000-0000-4000-8000-000000000099",
    imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
    instruction: "context",
    shortcutName: "",
  };
}

function config() {
  return {
    analysisJobTimeoutMs: 5000,
    analysisJobRetentionMs: 5000,
    analysisPollIntervalMs: 500,
    timeoutMs: 5000,
    apiKey: "xai-placeholder",
    model: "grok-4.5",
    allowedModels: new Set(["grok-4.5"]),
    mockMode: false,
    requireXaiZdr: true,
  };
}

function billingStub(calls) {
  return {
    async reserveAnalysis() {
      calls.push("reserve");
      return {
        allowed: true,
        model: "grok-4.5",
        reservation: { id: "reservation" },
      };
    },
    async consumeAnalysis() { calls.push("consume"); },
    async releaseAnalysis() { calls.push("release"); },
  };
}

function limiterStub(calls, label) {
  return {
    acquire() {
      calls.push(`${label}:acquire`);
      return () => calls.push(`${label}:release`);
    },
  };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for test condition.");
}
