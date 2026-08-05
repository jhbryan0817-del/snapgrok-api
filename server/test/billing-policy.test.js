import assert from "node:assert/strict";
import test from "node:test";
import {
  accessPeriodFor,
  chooseEffectiveSubscription,
  isBillingEnforcedForUser,
  isSubscriptionEntitled,
} from "../src/billing-policy.js";

const config = {
  billingMode: "test",
  billingTesterUserIds: new Set(["user_tester1234567890"]),
  whopPlusPlanId: "plan_plus123456",
  whopPlusProductId: "prod_plus123456",
  whopUltraPlanId: "plan_ultra123456",
  whopUltraProductId: "prod_ultra123456",
};

test("test billing applies only to explicitly allowlisted Clerk users", () => {
  assert.equal(
    isBillingEnforcedForUser(config, "user_tester1234567890"),
    true,
  );
  assert.equal(
    isBillingEnforcedForUser(config, "user_other1234567890"),
    false,
  );
  assert.equal(
    isBillingEnforcedForUser(
      { ...config, billingMode: "live" },
      "user_other1234567890",
    ),
    true,
  );
});

test("free quota periods use UTC calendar days", () => {
  const period = accessPeriodFor({
    planId: "free",
    now: new Date("2026-07-27T23:59:59.000Z"),
  });
  assert.equal(period.key, "free:2026-07-27");
  assert.equal(period.allowance, 5);
  assert.equal(period.model, "grok-4.3");
  assert.equal(period.startsAt.toISOString(), "2026-07-27T00:00:00.000Z");
  assert.equal(period.endsAt.toISOString(), "2026-07-28T00:00:00.000Z");
});

test("paid period keys remain stable throughout one Whop billing period", () => {
  const subscription = {
    id: "123",
    periodStartedAt: "2026-07-01T12:00:00.000Z",
    endsAt: "2026-08-01T12:00:00.000Z",
  };
  const first = accessPeriodFor({
    planId: "plus",
    subscription,
    now: new Date("2026-07-27T00:00:00.000Z"),
  });
  const retry = accessPeriodFor({
    planId: "plus",
    subscription: {
      ...subscription,
      endsAt: "2026-08-05T12:00:00.000Z",
    },
    now: new Date("2026-07-27T00:00:00.000Z"),
  });
  assert.equal(first.key, retry.key);
  assert.equal(first.allowance, 200);
  assert.equal(first.model, "grok-4.3");
});

test("cancel-at-period-end memberships retain access only through ends_at", () => {
  assert.equal(
    isSubscriptionEntitled(
      {
        status: "cancel_at_period_end",
        endsAt: "2026-07-28T00:00:00.000Z",
      },
      new Date("2026-07-27T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isSubscriptionEntitled(
      {
        status: "cancel_at_period_end",
        endsAt: "2026-07-26T00:00:00.000Z",
      },
      new Date("2026-07-27T00:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isSubscriptionEntitled(
      { status: "expired", endsAt: "2026-07-28T00:00:00.000Z" },
      new Date("2026-07-27T00:00:00.000Z"),
    ),
    false,
  );
});

test("the highest entitled plan wins if provider data contains duplicates", () => {
  const selected = chooseEffectiveSubscription(
    config,
    [
      {
        id: "plus-sub",
        providerPlanId: "plan_plus123456",
        providerProductId: "prod_plus123456",
        status: "active",
        updatedAt: "2026-07-27T00:00:00.000Z",
      },
      {
        id: "ultra-sub",
        providerPlanId: "plan_ultra123456",
        providerProductId: "prod_ultra123456",
        status: "active",
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
    ],
    new Date("2026-07-27T00:00:00.000Z"),
  );
  assert.equal(selected.id, "ultra-sub");
  assert.equal(selected.planId, "ultra");
});
