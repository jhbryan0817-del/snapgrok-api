import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresBillingStore } from "../src/whop-billing-store.js";

const PAYMENT = {
  id: "pay_payment123456",
  membershipId: "mem_membership123456",
  companyId: "biz_745hMbzbWHtrZr",
  productId: "prod_M3Wts8bsfX4mK",
  planId: "plan_QzpD3pxTswPLX",
  planCode: "plus",
  checkoutConfigurationId: "ch_checkout123456",
  substatus: "refunded",
  displayStatus: "refunded",
  paidAt: new Date("2026-07-27T00:00:00.000Z"),
  createdAt: new Date("2026-07-27T00:00:00.000Z"),
  updatedAt: new Date("2026-07-27T00:00:05.000Z"),
};

test("an older adverse-payment replay is ignored without querying an empty UUID", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_memberships")) return { rows: [] };
      if (sql.startsWith("SELECT clerk_user_id, company_id")) {
        return {
          rows: [{
            clerk_user_id: "user_CheckoutTester123",
            company_id: PAYMENT.companyId,
            product_id: PAYMENT.productId,
            plan_id: PAYMENT.planId,
            state_changed_at: new Date("2026-07-27T00:00:06.000Z"),
          }],
        };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const result = await store.applyPaymentStateWebhook(
    paymentStateInput({ payment: PAYMENT }),
  );
  assert.deepEqual(result, { duplicate: false, applied: false, stale: true });
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE billing_checkout_sessions")),
    false,
  );
  assert.equal(
    queries.some(
      (sql) =>
        sql.startsWith("UPDATE billing_provider_events") &&
        sql.includes("processing_state"),
    ),
    true,
  );
});

test("an unmapped adverse payment with no checkout intent is quarantined safely", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const result = await store.applyPaymentStateWebhook(
    paymentStateInput({
      payment: { ...PAYMENT, membershipId: "mem_missing123456" },
    }),
  );
  assert.deepEqual(
    result,
    { duplicate: false, applied: false, quarantined: true },
  );
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE billing_checkout_sessions")),
    false,
  );
});

test("a validated failed checkout intent still follows the recovery path", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_checkout_sessions")) {
        return { rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const result = await store.applyPaymentStateWebhook(
    paymentStateInput({
      customUserId: "user_CheckoutTester123",
      checkoutIntentId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.deepEqual(result, { duplicate: false, applied: true });
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE billing_checkout_sessions")),
    true,
  );
});

function paymentStateInput(overrides = {}) {
  return {
    deliveryId: "reconcile_payment123456",
    eventName: "reconciliation.payment_revoked",
    eventTimestamp: new Date("2026-07-27T00:00:05.000Z"),
    payloadDigest: "a".repeat(64),
    sanitizedPayload: { resourceId: PAYMENT.id },
    payment: PAYMENT,
    customUserId: "",
    checkoutIntentId: "",
    accessState: "revoked",
    ...overrides,
  };
}

function scriptedPool(runQuery) {
  const client = {
    async query(text) {
      const sql = String(text).replace(/\s+/g, " ").trim();
      return runQuery(sql);
    },
    release() {},
  };
  return {
    async connect() { return client; },
    async query(text) { return client.query(text); },
  };
}
