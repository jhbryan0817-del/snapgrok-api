import assert from "node:assert/strict";
import test from "node:test";
import { UserRateLimiter } from "../src/rate-limit.js";

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
