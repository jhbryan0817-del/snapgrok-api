import assert from "node:assert/strict";
import test from "node:test";
import {
  AdaptiveCapacityLimiter,
  UserRateLimiter,
  WeightedCapacityLimiter,
} from "../src/rate-limit.js";

test("limits concurrent work per user and releases slots", () => {
  const limiter = new UserRateLimiter({
    windowMs: 60000,
    maxRequests: 10,
    maxConcurrent: 1,
  });

  const release = limiter.acquire("user_1");
  assert.throws(() => limiter.acquire("user_1"), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, "RATE_LIMITED");
    return true;
  });

  release();
  assert.doesNotThrow(() => limiter.acquire("user_1")());
});

test("resets the request window after it expires", () => {
  let now = 1000;
  const limiter = new UserRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    maxConcurrent: 1,
    now: () => now,
  });

  limiter.acquire("user_1")();
  assert.throws(() => limiter.acquire("user_1"), { status: 429 });
  now = 2001;
  assert.doesNotThrow(() => limiter.acquire("user_1")());
});

test("caps tracked identities instead of growing memory without bound", () => {
  const limiter = new UserRateLimiter({
    windowMs: 60000,
    maxRequests: 10,
    maxConcurrent: 1,
    maxTrackedUsers: 1,
  });

  limiter.acquire("user_1")();
  assert.throws(
    () => limiter.acquire("user_2"),
    (error) =>
      error.status === 429 && error.code === "RATE_LIMIT_CAPACITY",
  );
});

test("uses distinct global admission-control error codes", () => {
  const limiter = new UserRateLimiter({
    windowMs: 60000,
    maxRequests: 10,
    maxConcurrent: 1,
    maxTrackedUsers: 1,
    scope: "global",
  });

  const release = limiter.acquire("protected-api");
  assert.throws(
    () => limiter.acquire("protected-api"),
    (error) =>
      error.status === 429 && error.code === "GLOBAL_CONCURRENCY_LIMITED",
  );
  release();
});

test("uses distinct account-operation admission-control error codes", () => {
  const limiter = new UserRateLimiter({
    windowMs: 60000,
    maxRequests: 1,
    maxConcurrent: 1,
    scope: "account",
  });

  const release = limiter.acquire("user_1");
  assert.throws(
    () => limiter.acquire("user_1"),
    (error) =>
      error.status === 429 && error.code === "ACCOUNT_OPERATION_BUSY",
  );
  release();
  assert.throws(
    () => limiter.acquire("user_1"),
    (error) =>
      error.status === 429 && error.code === "ACCOUNT_RATE_LIMITED",
  );
});

test("weighted capacity bounds aggregate in-flight analysis bytes", () => {
  const limiter = new WeightedCapacityLimiter({ maxWeight: 10 });
  const releaseFirst = limiter.acquire(6);
  assert.deepEqual(limiter.snapshot(), {
    scope: "analysis",
    activeWeight: 6,
    maxWeight: 10,
  });
  assert.throws(
    () => limiter.acquire(5),
    (error) => error.status === 429 && error.code === "ANALYSIS_MEMORY_LIMITED",
  );
  const releaseSecond = limiter.acquire(4);
  releaseFirst();
  releaseFirst();
  assert.equal(limiter.snapshot().activeWeight, 4);
  releaseSecond();
  assert.equal(limiter.snapshot().activeWeight, 0);
});

test("adaptive capacity sheds new work under pressure and recovers gradually", () => {
  let now = 1000;
  const limiter = new AdaptiveCapacityLimiter({
    maxConcurrent: 40,
    minConcurrent: 10,
    recoveryMs: 1000,
    now: () => now,
  });

  limiter.recordPressure("event_loop", { factor: 0.5, cooldownMs: 2000 });
  assert.equal(limiter.snapshot().currentLimit, 20);
  const releases = Array.from({ length: 20 }, () => limiter.acquire());
  assert.throws(
    () => limiter.acquire(),
    (error) =>
      error.status === 429 &&
      error.code === "ANALYSIS_ADAPTIVELY_LIMITED" &&
      error.retryAfterSeconds === 2,
  );

  releases.forEach((release) => release());
  now = 4000;
  assert.equal(limiter.snapshot().currentLimit, 21);
  now = 23000;
  assert.equal(limiter.snapshot().currentLimit, 40);
  assert.equal(limiter.snapshot().lastPressureReason, "none");
});

test("adaptive capacity never drops below its configured safe floor", () => {
  const limiter = new AdaptiveCapacityLimiter({
    maxConcurrent: 40,
    minConcurrent: 10,
  });

  for (let index = 0; index < 10; index += 1) {
    limiter.recordPressure("provider_rate_limit", { factor: 0.25 });
  }
  assert.equal(limiter.snapshot().currentLimit, 10);
});
