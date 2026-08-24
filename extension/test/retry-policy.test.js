"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "retry-policy.js"),
  "utf8",
);

function loadPolicy() {
  const context = { Date, Math, Number, Set, self: {} };
  vm.runInNewContext(SOURCE, context, { filename: "retry-policy.js" });
  return context.self.SnapGrokRetryPolicy;
}

test("capacity retries honor Retry-After and bounded jitter", () => {
  const policy = loadPolicy();
  assert.equal(policy.capacityRetryDelay({
    status: 429,
    code: "ANALYSIS_ADAPTIVELY_LIMITED",
    retryAfterHeader: "2",
    attempt: 0,
    random: 0.4,
  }), 2100);
  assert.equal(policy.capacityRetryDelay({
    status: 429,
    code: "ANALYSIS_MEMORY_LIMITED",
    attempt: 2,
    random: 0,
  }), 3000);
});

test("quota and authentication failures are never retried as capacity", () => {
  const policy = loadPolicy();
  assert.equal(policy.capacityRetryDelay({ status: 429, code: "QUOTA_EXHAUSTED" }), null);
  assert.equal(policy.capacityRetryDelay({ status: 401, code: "AUTH_REQUIRED" }), null);
});
