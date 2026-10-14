import assert from "node:assert/strict";
import test from "node:test";
import { createConfig } from "../src/server.js";
import { inferenceBudgets } from "../src/inference-budget.js";

test("free accounts share a daily ceiling while canary starts survive midnight and restarts", () => {
  const config = createConfig({ BILLING_MODE: "live", CANARY_USER_IDS: "user_test", CANARY_RUN_ID: "launch-20261014" });
  const today = inferenceBudgets(config, { userId: "user_test", planId: "free" }, new Date("2026-10-14T23:59:00Z"));
  const tomorrow = inferenceBudgets(config, { userId: "user_test", planId: "free" }, new Date("2026-10-15T00:01:00Z"));
  assert.deepEqual(today.map(b => b.limit), [15, 5000, 1000, 400]);
  assert.notEqual(today[0].key, tomorrow[0].key);
  assert.equal(today[3].key, tomorrow[3].key);
  const other = inferenceBudgets(config, { userId: "user_other", planId: "free" });
  assert.equal(other.length, 3);
  assert.equal(other[1].userId, today[1].userId);
  const paid = inferenceBudgets(config, { userId: "user_paid", planId: "ultra" });
  assert.deepEqual(paid.map(b => b.limit), [1000, 5000]);
  assert.throws(() => createConfig({ CANARY_USER_IDS: "user_test" }), /CANARY_RUN_ID/);
  assert.throws(() => createConfig({ CANARY_MAX_XAI_ATTEMPTS: "401" }), /CANARY_MAX_XAI_ATTEMPTS/);
});
