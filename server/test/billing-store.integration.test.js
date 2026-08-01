import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { createPostgresBillingStore } from "../src/billing-store.js";

const { Pool } = pg;
const TEST_DATABASE_URL = String(process.env.TEST_DATABASE_URL || "").trim();

test(
  "PostgreSQL atomically enforces quotas and immutable subscription mapping",
  { skip: !TEST_DATABASE_URL, timeout: 30_000 },
  async () => {
    const schema = `billing_test_${randomBytes(8).toString("hex")}`;
    const admin = new Pool({
      connectionString: TEST_DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5_000,
    });
    const migration = await readFile(
      new URL("../migrations/001_billing_foundation.sql", import.meta.url),
      "utf8",
    );

    await admin.query(`CREATE SCHEMA "${schema}"`);
    const migrationClient = await admin.connect();
    try {
      await migrationClient.query(`SET search_path TO "${schema}"`);
      await migrationClient.query(migration);
      await migrationClient.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        ["001_billing_foundation.sql"],
      );
    } finally {
      migrationClient.release();
    }

    const scopedUrl = new URL(TEST_DATABASE_URL);
    scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
    const store = createPostgresBillingStore({
      connectionString: scopedUrl.href,
      poolMax: 12,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 10_000,
    });

    try {
      await store.initialize();
      await verifyAtomicQuota(store);
      await verifyCheckoutAndSubscriptionMapping(store);
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
  const attempts = Array.from({ length: 10 }, () =>
    store.reserveUsage({
      userId,
      operationId: randomUUID(),
      planId: "free",
      model: "grok-4.3",
      period,
    }),
  );
  const results = await Promise.allSettled(attempts);
  const successful = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const rejected = results.filter((result) => result.status === "rejected");

  assert.equal(successful.length, 5);
  assert.equal(rejected.length, 5);
  for (const result of rejected) {
    assert.equal(result.reason.code, "QUOTA_EXHAUSTED");
  }

  await store.consumeUsage(successful[0].operationId, userId);
  await store.releaseUsage(successful[1].operationId, userId);
  let usage = await store.getUsagePeriod(userId, period.key);
  assert.equal(usage.consumed, 1);
  assert.equal(usage.reserved, 3);

  const replacement = await store.reserveUsage({
    userId,
    operationId: randomUUID(),
    planId: "free",
    model: "grok-4.3",
    period,
  });
  assert.equal(replacement.remaining, 0);
  await assert.rejects(
    store.reserveUsage({
      userId,
      operationId: randomUUID(),
      planId: "free",
      model: "grok-4.3",
      period,
    }),
    (error) => error.code === "QUOTA_EXHAUSTED",
  );

  assert.equal(
    await store.releaseStaleReservations(new Date("2100-01-01T00:00:00.000Z")),
    1,
  );
  usage = await store.getUsagePeriod(userId, period.key);
  assert.equal(usage.consumed, 1);
  assert.equal(usage.reserved, 0);
}

async function verifyCheckoutAndSubscriptionMapping(store) {
  const userId = "user_CheckoutTester123";
  const intentId = randomUUID();
  const expiry = new Date(Date.now() + 30 * 60 * 1000);
  await store.createCheckoutIntent({
    id: intentId,
    userId,
    planId: "plus",
    variantId: "1950632",
    expiresAt: expiry,
  });
  await store.markCheckoutCreated(
    intentId,
    "checkout_123",
    "https://sneaksolve.lemonsqueezy.com/checkout/example",
  );

  const reused = await store.createCheckoutIntent({
    id: randomUUID(),
    userId,
    planId: "plus",
    variantId: "1950632",
    expiresAt: expiry,
  });
  assert.equal(
    reused.existingUrl,
    "https://sneaksolve.lemonsqueezy.com/checkout/example",
  );
  await assert.rejects(
    store.createCheckoutIntent({
      id: randomUUID(),
      userId,
      planId: "ultra",
      variantId: "1950672",
      expiresAt: expiry,
    }),
    (error) => error.code === "CHECKOUT_PLAN_CHANGE_PENDING",
  );

  const subscription = normalizedSubscription("123456");
  const applied = await store.applySubscriptionWebhook({
    deliveryHash: "a".repeat(64),
    eventName: "subscription_created",
    body: { safe: "test-payload" },
    normalizedSubscription: subscription,
    customUserId: userId,
    checkoutIntentId: intentId,
  });
  assert.deepEqual(applied, { duplicate: false, applied: true });

  const duplicate = await store.applySubscriptionWebhook({
    deliveryHash: "a".repeat(64),
    eventName: "subscription_created",
    body: { safe: "test-payload" },
    normalizedSubscription: subscription,
    customUserId: userId,
    checkoutIntentId: intentId,
  });
  assert.deepEqual(duplicate, { duplicate: true, applied: false });

  const mapped = await store.listSubscriptions(userId);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, "123456");
  assert.equal(mapped[0].planId, undefined);

  const reusedConsumedIntent = await store.applySubscriptionWebhook({
    deliveryHash: "b".repeat(64),
    eventName: "subscription_created",
    body: { safe: "second-subscription" },
    normalizedSubscription: normalizedSubscription("123457"),
    customUserId: userId,
    checkoutIntentId: intentId,
  });
  assert.equal(reusedConsumedIntent.quarantined, true);
  assert.equal((await store.listSubscriptions(userId)).length, 1);
}

function normalizedSubscription(id) {
  return {
    id,
    storeId: "439517",
    productId: "1247816",
    variantId: "1950632",
    customerId: "777001",
    orderId: "888001",
    status: "active",
    testMode: true,
    renewsAt: new Date("2026-08-27T00:00:00.000Z"),
    endsAt: null,
    trialEndsAt: null,
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
    updatedAt: new Date("2026-07-27T00:00:01.000Z"),
  };
}
