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
