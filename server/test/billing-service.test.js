import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createBillingService } from "../src/billing-service.js";

const TESTER = "user_3Gz7yVU8kEhL2wq9r1I7MWOmLHz";
const OTHER_USER = "user_3GxBDK6RNVw9loNv9eTxVMC05yO";
const NOW = new Date("2026-07-27T12:00:00.000Z");

function testConfig() {
  return {
    billingMode: "test",
    billingTesterUserIds: new Set([TESTER]),
    billingWebsiteOrigin: "https://www.sneaksolve.com",
    billingReservationTtlMs: 300000,
    billingWebhookRetentionDays: 30,
    lemonWebhookSecret: "0123456789abcdef0123456789abcdef",
    lemonStoreId: "439517",
    lemonProductId: "1247816",
    lemonPlusVariantId: "1950632",
    lemonUltraVariantId: "1950672",
  };
}

function fakeStore(overrides = {}) {
  return {
    async initialize() {},
    async close() {},
    async releaseStaleReservations() { return 0; },
    async purgeWebhookBodies() { return 0; },
    async listSubscriptions() { return []; },
    async listMappedSubscriptionIds() { return []; },
    async syncMappedSubscription() { return true; },
    async getUsagePeriod() { return null; },
    async reserveUsage(input) {
      return {
        operationId: input.operationId,
        planId: input.planId,
        model: input.model,
        allowance: input.period.allowance,
        remaining: input.period.allowance - 1,
        resetsAt: input.period.endsAt,
      };
    },
    async consumeUsage() { return true; },
    async releaseUsage() { return true; },
    async createCheckoutIntent(input) {
      return { id: input.id, existingUrl: null };
    },
    async markCheckoutCreated() {},
    async markCheckoutFailed() {},
    async applySubscriptionWebhook() {
      return { duplicate: false, applied: true };
    },
    async applySubscriptionPaymentWebhook() {
      return { duplicate: false, applied: true };
    },
    async recordWebhook() { return { duplicate: false }; },
    ...overrides,
  };
}

function fakeLemon(overrides = {}) {
  return {
    async createCheckout() {
      return {
        id: "checkout-id",
        url: "https://sneaksolve.lemonsqueezy.com/checkout/test",
      };
    },
    async customerPortalUrl() {
      return "https://sneaksolve.lemonsqueezy.com/billing?signature=test";
    },
    async retrieveSubscription() {
      return subscriptionResource();
    },
    ...overrides,
  };
}

test("non-testers preserve legacy access during test rollout", async () => {
  let storeCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listSubscriptions() {
        storeCalls += 1;
        return [];
      },
    }),
    lemonClient: fakeLemon(),
    now: () => NOW,
  });
  const access = await service.reserveAnalysis({
    userId: OTHER_USER,
    operationId: "",
    defaultModel: "grok-4.5",
  });
  assert.deepEqual(access, {
    allowed: true,
    model: "grok-4.5",
    reservation: null,
    planId: "legacy",
  });
  assert.equal(storeCalls, 0);
});

test("testers receive the free UTC quota and Grok 4.3", async () => {
  let reservationInput;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async reserveUsage(input) {
        reservationInput = input;
        return {
          operationId: input.operationId,
          planId: input.planId,
          model: input.model,
        };
      },
    }),
    lemonClient: fakeLemon(),
    now: () => NOW,
  });
  const access = await service.reserveAnalysis({
    userId: TESTER,
    operationId: "11111111-1111-4111-8111-111111111111",
    defaultModel: "grok-4.5",
  });
  assert.equal(access.model, "grok-4.3");
  assert.equal(reservationInput.planId, "free");
  assert.equal(reservationInput.period.allowance, 5);
  assert.equal(
    reservationInput.period.endsAt.toISOString(),
    "2026-07-28T00:00:00.000Z",
  );
});

test("billing status returns display-safe plan and remaining usage", async () => {
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async getUsagePeriod() {
        return { consumed: 2, reserved: 1 };
      },
    }),
    lemonClient: fakeLemon(),
    now: () => NOW,
  });
  const status = await service.status(TESTER);
  assert.deepEqual(status.plan, {
    id: "free",
    name: "Free",
    allowance: 5,
    cadence: "day",
    model: "grok-4.3",
  });
  assert.deepEqual(status.usage, {
    allowance: 5,
    consumed: 2,
    reserved: 1,
    remaining: 2,
    resetsAt: "2026-07-28T00:00:00.000Z",
  });
});

test("checkout is created server-side with an opaque intent bound to Clerk", async () => {
  let lemonInput;
  let marked;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async markCheckoutCreated(...args) {
        marked = args;
      },
    }),
    lemonClient: fakeLemon({
      async createCheckout(input) {
        lemonInput = input;
        return {
          id: "checkout-123",
          url: "https://sneaksolve.lemonsqueezy.com/checkout/test",
        };
      },
    }),
    now: () => NOW,
  });

  const checkout = await service.createCheckout({
    userId: TESTER,
    planId: "ultra",
    email: "tester@example.com",
    name: "Test User",
  });
  assert.equal(
    checkout.url,
    "https://sneaksolve.lemonsqueezy.com/checkout/test",
  );
  assert.equal(lemonInput.variantId, "1950672");
  assert.equal(lemonInput.custom.clerk_user_id, TESTER);
  assert.match(lemonInput.custom.checkout_intent_id, /^[0-9a-f-]{36}$/);
  assert.equal(
    lemonInput.redirectUrl,
    "https://www.sneaksolve.com/account?billing=return",
  );
  assert.equal(marked[0], lemonInput.custom.checkout_intent_id);
  assert.equal(marked[1], "checkout-123");
});

test("invalid webhook signatures are rejected before storage", async () => {
  let storeCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async recordWebhook() {
        storeCalls += 1;
      },
    }),
    lemonClient: fakeLemon(),
    now: () => NOW,
  });
  await assert.rejects(
    service.handleWebhook({
      rawBody: Buffer.from("{}"),
      signature: "0".repeat(64),
      headerEventName: "subscription_created",
    }),
    (error) =>
      error.status === 401 && error.code === "WEBHOOK_SIGNATURE_INVALID",
  );
  assert.equal(storeCalls, 0);
});

test("valid subscription webhooks are normalized and applied", async () => {
  let applied;
  const store = fakeStore({
    async applySubscriptionWebhook(input) {
      applied = input;
      return { duplicate: false, applied: true };
    },
  });
  const service = createBillingService({
    config: testConfig(),
    store,
    lemonClient: fakeLemon(),
    now: () => NOW,
  });
  const body = {
    meta: {
      event_name: "subscription_created",
      custom_data: {
        clerk_user_id: TESTER,
        checkout_intent_id: "11111111-1111-4111-8111-111111111111",
      },
    },
    data: subscriptionResource(),
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const result = await service.handleWebhook({
    rawBody,
    signature: signatureFor(rawBody),
    headerEventName: "subscription_created",
  });
  assert.equal(result.applied, true);
  assert.equal(applied.customUserId, TESTER);
  assert.equal(applied.normalizedSubscription.variantId, "1950632");
  assert.equal(applied.normalizedSubscription.testMode, true);
});

test("valid but wrong-store webhooks are quarantined without entitlement", async () => {
  let quarantined;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async recordWebhook(input) {
        quarantined = input;
        return { duplicate: false };
      },
    }),
    lemonClient: fakeLemon(),
    now: () => NOW,
  });
  const resource = subscriptionResource();
  resource.attributes.store_id = 999999;
  const body = {
    meta: { event_name: "subscription_updated" },
    data: resource,
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const result = await service.handleWebhook({
    rawBody,
    signature: signatureFor(rawBody),
    headerEventName: "subscription_updated",
  });
  assert.equal(result.quarantined, true);
  assert.equal(quarantined.state, "quarantined");
  assert.equal(quarantined.reason, "billing_configuration_mismatch");
});

test("successful renewal invoices advance the quota cycle exactly once", async () => {
  let paymentInput;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applySubscriptionPaymentWebhook(input) {
        paymentInput = input;
        return { duplicate: false, applied: true };
      },
    }),
    lemonClient: fakeLemon(),
    now: () => NOW,
  });
  const body = {
    meta: { event_name: "subscription_payment_success" },
    data: {
      type: "subscription-invoices",
      id: "9001",
      attributes: {
        store_id: 439517,
        subscription_id: 7001,
        billing_reason: "renewal",
        status: "paid",
        created_at: "2026-07-27T11:59:00.000Z",
        updated_at: "2026-07-27T11:59:01.000Z",
        test_mode: true,
      },
    },
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const result = await service.handleWebhook({
    rawBody,
    signature: signatureFor(rawBody),
    headerEventName: "subscription_payment_success",
  });
  assert.equal(result.applied, true);
  assert.equal(paymentInput.normalizedSubscription.id, "7001");
  assert.equal(
    paymentInput.cycleStartedAt.toISOString(),
    "2026-07-27T11:59:00.000Z",
  );
});

function subscriptionResource() {
  return {
    type: "subscriptions",
    id: "7001",
    attributes: {
      store_id: 439517,
      customer_id: 8001,
      order_id: 8101,
      product_id: 1247816,
      variant_id: 1950632,
      status: "active",
      renews_at: "2026-08-27T12:00:00.000Z",
      ends_at: null,
      trial_ends_at: null,
      created_at: "2026-07-27T12:00:00.000Z",
      updated_at: "2026-07-27T12:00:01.000Z",
      test_mode: true,
    },
  };
}

function signatureFor(rawBody) {
  return createHmac(
    "sha256",
    testConfig().lemonWebhookSecret,
  ).update(rawBody).digest("hex");
}
