import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { createPostgresBillingStore } from "../src/whop-billing-store.js";

const { Pool } = pg;
const TEST_DATABASE_URL = String(process.env.TEST_DATABASE_URL || "").trim();

test(
  "PostgreSQL atomically enforces quotas and immutable Whop membership mapping",
  { skip: !TEST_DATABASE_URL, timeout: 30_000 },
  async () => {
    const schema = `billing_test_${randomBytes(8).toString("hex")}`;
    const admin = new Pool({
      connectionString: TEST_DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5_000,
    });
    const migrations = await Promise.all([
      "001_billing_foundation.sql",
      "003_whop_billing_foundation.sql",
      "004_whop_production_lifecycle.sql",
      "005_single_plan_and_payment_history.sql",
    ].map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")));

    await admin.query(`CREATE SCHEMA "${schema}"`);
    const migrationClient = await admin.connect();
    try {
      await migrationClient.query(`SET search_path TO "${schema}"`);
      for (const migration of migrations) await migrationClient.query(migration);
    } finally {
      migrationClient.release();
    }

    const scopedUrl = new URL(TEST_DATABASE_URL);
    scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
    const store = createPostgresBillingStore({
      connectionString: scopedUrl.href,
      providerMode: "test",
      poolMax: 12,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 10_000,
    });

    try {
      await store.initialize();
      await verifyAtomicQuota(store);
      await verifyCheckoutAndMembershipMapping(store);
      const liveStore = createPostgresBillingStore({
        connectionString: scopedUrl.href,
        providerMode: "live",
        poolMax: 2,
        connectionTimeoutMs: 5_000,
        statementTimeoutMs: 10_000,
      });
      try {
        await liveStore.initialize();
        assert.deepEqual(
          await liveStore.listSubscriptions("user_CheckoutTester123"),
          [],
        );
      } finally {
        await liveStore.close();
      }
    } finally {
      await store.close();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  },
);

async function verifyAtomicQuota(store) {
  const userId = "user_DatabaseTester123";
  const period = {
    key: "free:2026-07-27",
    allowance: 5,
    model: "grok-4.3",
    startsAt: new Date("2026-07-27T00:00:00.000Z"),
    endsAt: new Date("2026-07-28T00:00:00.000Z"),
  };
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => store.reserveUsage({
      userId,
      operationId: randomUUID(),
      planId: "free",
      model: "grok-4.3",
      period,
    })),
  );
  const successful = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(successful.length, 5);
  assert.equal(rejected.length, 5);
  for (const result of rejected) assert.equal(result.reason.code, "QUOTA_EXHAUSTED");

  await store.consumeUsage(successful[0].operationId, userId);
  await store.releaseUsage(successful[1].operationId, userId);
  let usage = await store.getUsagePeriod(userId, period.key);
  assert.equal(usage.consumed, 1);
  assert.equal(usage.reserved, 3);
  assert.equal(
    await store.releaseStaleReservations(new Date("2100-01-01T00:00:00.000Z")),
    1,
  );
  usage = await store.getUsagePeriod(userId, period.key);
  assert.equal(usage.reserved, 0);
}

async function verifyCheckoutAndMembershipMapping(store) {
  const userId = "user_CheckoutTester123";
  const intentId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await store.createCheckoutIntent({
    id: intentId,
    userId,
    planCode: "plus",
    companyId: "biz_745hMbzbWHtrZr",
    productId: "prod_M3Wts8bsfX4mK",
    providerPlanId: "plan_QzpD3pxTswPLX",
    expiresAt,
  });
  await store.markCheckoutCreated(
    intentId,
    "ch_checkout123456",
    "https://sandbox.whop.com/checkout/example?session=ch_checkout123456",
  );

  const reused = await store.createCheckoutIntent({
    id: randomUUID(),
    userId,
    planCode: "plus",
    companyId: "biz_745hMbzbWHtrZr",
    productId: "prod_M3Wts8bsfX4mK",
    providerPlanId: "plan_QzpD3pxTswPLX",
    expiresAt,
  });
  assert.match(reused.existingUrl, /^https:\/\/sandbox\.whop\.com/);
  await assert.rejects(
    store.createCheckoutIntent({
      id: randomUUID(),
      userId,
      planCode: "ultra",
      companyId: "biz_745hMbzbWHtrZr",
      productId: "prod_kIiWFLHOWhrWa",
      providerPlanId: "plan_FZknYvJ1uz41F",
      expiresAt,
    }),
    (error) => error.code === "CHECKOUT_PLAN_CHANGE_PENDING",
  );

  const membership = normalizedMembership();
  const input = {
    deliveryId: "msg_delivery123456",
    eventName: "membership.activated",
    eventTimestamp: new Date("2026-07-27T00:00:02.000Z"),
    payloadDigest: "a".repeat(64),
    sanitizedPayload: { resourceId: membership.id },
    membership,
    payment: {
      id: "pay_payment123456",
      membershipId: membership.id,
      companyId: membership.companyId,
      productId: membership.productId,
      planId: membership.planId,
      planCode: membership.planCode,
      checkoutConfigurationId: membership.checkoutConfigurationId,
      substatus: "succeeded",
      displayStatus: "paid",
      paidAt: new Date("2026-07-27T00:00:02.000Z"),
      createdAt: new Date("2026-07-27T00:00:02.000Z"),
      updatedAt: new Date("2026-07-27T00:00:02.000Z"),
    },
    customUserId: userId,
    checkoutIntentId: intentId,
  };
  assert.deepEqual(
    await store.applyMembershipWebhook(input),
    { duplicate: false, applied: true },
  );
  assert.deepEqual(
    await store.applyMembershipWebhook(input),
    { duplicate: true, applied: false },
  );

  let mapped = await store.listSubscriptions(userId);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, "mem_membership123456");
  assert.equal(mapped[0].status, "active");
  const history = await store.listPaymentHistory(userId);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "paid");
  assert.equal(history[0].planId, "plus");

  await assert.rejects(
    store.createCheckoutIntent({
      id: randomUUID(),
      userId,
      planCode: "ultra",
      companyId: membership.companyId,
      productId: "prod_kIiWFLHOWhrWa",
      providerPlanId: "plan_FZknYvJ1uz41F",
      expiresAt,
    }),
    (error) => error.code === "SUBSCRIPTION_ALREADY_ACTIVE",
  );

  const transferAttempt = await store.applyMembershipWebhook({
    ...input,
    deliveryId: "msg_transfer123456",
    payloadDigest: "b".repeat(64),
    eventTimestamp: new Date("2026-07-27T00:00:03.000Z"),
    membership: { ...membership, userId: "user_differentWhopUser" },
  });
  assert.equal(transferAttempt.quarantined, true);

  const failed = await store.applyPaymentStateWebhook({
    deliveryId: "msg_failed123456",
    eventName: "payment.failed",
    eventTimestamp: new Date("2026-07-27T00:00:04.000Z"),
    payloadDigest: "c".repeat(64),
    sanitizedPayload: { resourceId: "pay_payment123456" },
    payment: {
      id: "pay_payment123456",
      membershipId: membership.id,
      companyId: membership.companyId,
      productId: membership.productId,
      planId: membership.planId,
      checkoutConfigurationId: membership.checkoutConfigurationId,
    },
    customUserId: userId,
    checkoutIntentId: intentId,
    accessState: "payment_failed",
    providerStatus: "past_due",
  });
  assert.equal(failed.applied, true);
  mapped = await store.listSubscriptions(userId);
  assert.equal(mapped[0].status, "payment_failed");
}

function normalizedMembership(overrides = {}) {
  return {
    id: "mem_membership123456",
    companyId: "biz_745hMbzbWHtrZr",
    productId: "prod_M3Wts8bsfX4mK",
    planId: "plan_QzpD3pxTswPLX",
    planCode: "plus",
    providerStatus: "active",
    accessState: "active",
    memberId: "mber_member123456",
    userId: "user_whopuser123456",
    renewalPeriodStart: new Date("2026-07-27T00:00:00.000Z"),
    renewalPeriodEnd: new Date("2026-08-27T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    checkoutConfigurationId: "ch_checkout123456",
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
    updatedAt: new Date("2026-07-27T00:00:01.000Z"),
    ...overrides,
  };
}
