import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createBillingService } from "../src/billing-service.js";

const TESTER = "user_SyntheticBillingTester0001";
const OTHER_USER = "user_SyntheticBillingOther0002";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const WEBHOOK_SECRET = "whop_sandbox_webhook_secret_0123456789";

function testConfig() {
  return {
    billingMode: "test",
    billingTesterUserIds: new Set([TESTER]),
    billingWebsiteOrigin: "https://www.zenaian.com",
    billingReservationTtlMs: 300000,
    billingCheckoutTtlMs: 1800000,
    billingReconciliationIntervalMs: 900000,
    billingWebhookRetentionDays: 30,
    whopWebhookSecret: WEBHOOK_SECRET,
    whopWebhookToleranceSeconds: 300,
    whopCompanyId: "biz_745hMbzbWHtrZr",
    whopPlusPlanId: "plan_newplus123456",
    whopPlusLegacyPlanIds: new Set(["plan_QzpD3pxTswPLX"]),
    whopPlusProductId: "prod_M3Wts8bsfX4mK",
    whopUltraPlanId: "plan_newultra123456",
    whopUltraLegacyPlanIds: new Set(["plan_FZknYvJ1uz41F"]),
    whopUltraProductId: "prod_kIiWFLHOWhrWa",
  };
}

function fakeStore(overrides = {}) {
  return {
    async initialize() {},
    async close() {},
    async releaseStaleReservations() { return 0; },
    async purgeWebhookBodies() { return 0; },
    async listSubscriptions() { return []; },
    async listPaymentHistory() { return []; },
    async listMappedMembershipIds() { return []; },
    async listAdverseRenewalCancellationIds() { return []; },
    async listPendingCheckoutTombstones() { return []; },
    async listRecoverableCheckoutIntents() { return []; },
    async syncMappedMembership() { return true; },
    async getUsagePeriod() { return null; },
    async reserveUsage(input) {
      return {
        operationId: input.operationId,
        planId: input.planId,
        model: input.model,
      };
    },
    async consumeUsage() { return true; },
    async releaseUsage() { return true; },
    async createCheckoutIntent(input) { return { id: input.id, existingUrl: null }; },
    async markCheckoutCreated() {},
    async markCheckoutFailed() {},
    async applyMembershipWebhook() { return { duplicate: false, applied: true }; },
    async applyPaymentStateWebhook() { return { duplicate: false, applied: true }; },
    async confirmCheckoutTombstoneTermination() { return true; },
    async recordProviderEvent() { return { duplicate: false }; },
    ...overrides,
  };
}

function fakeWhop(overrides = {}) {
  return {
    async createCheckout() {
      return {
        id: "ch_checkout123456",
        url: "https://sandbox.whop.com/checkout/plan?session=ch_checkout123456",
      };
    },
    async retrieveMembership() { return membershipResource(); },
    async retrievePayment() { return paymentResource("paid", "succeeded"); },
    async listPaymentsSince() { return []; },
    async cancelMembershipAtPeriodEnd() {
      return membershipResource({ status: "canceling", cancel_at_period_end: true });
    },
    async cancelMembershipImmediately() {
      return membershipResource({
        status: "canceled",
        cancel_at_period_end: false,
        canceled_at: "2026-07-27T12:00:02.000Z",
        updated_at: "2026-07-27T12:00:02.000Z",
      });
    },
    async uncancelMembership() {
      return membershipResource({ status: "active", cancel_at_period_end: false });
    },
    ...overrides,
  };
}

test("non-testers preserve legacy access during sandbox rollout", async () => {
  let storeCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({ async listSubscriptions() { storeCalls += 1; return []; } }),
    whopClient: fakeWhop(),
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

test("sandbox testers receive the free UTC quota and Grok 4.3", async () => {
  let reservationInput;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async reserveUsage(input) { reservationInput = input; return { operationId: input.operationId }; },
    }),
    whopClient: fakeWhop(),
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
});

test("checkout pins the server-side Whop catalog without sending Zenaian metadata", async () => {
  let providerInput;
  let intentInput;
  let marked;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async createCheckoutIntent(input) { intentInput = input; return { id: input.id, existingUrl: null }; },
      async markCheckoutCreated(...args) { marked = args; },
    }),
    whopClient: fakeWhop({
      async createCheckout(input) {
        providerInput = input;
        return {
          id: "ch_checkout123456",
          url: "https://sandbox.whop.com/checkout/plan?session=ch_checkout123456",
        };
      },
    }),
    now: () => NOW,
  });
  const checkout = await service.createCheckout({ userId: TESTER, planId: "ultra" });
  assert.match(checkout.url, /^https:\/\/sandbox\.whop\.com\//);
  assert.equal(intentInput.providerPlanId, "plan_newultra123456");
  assert.equal(intentInput.productId, "prod_kIiWFLHOWhrWa");
  assert.equal(providerInput.planId, "plan_newultra123456");
  assert.equal(Object.hasOwn(providerInput, "metadata"), false);
  assert.equal(providerInput.redirectUrl, "https://www.zenaian.com/account?billing=return");
  assert.equal(marked[0], intentInput.id);
});

test("checkout is blocked while any paid plan remains entitled", async () => {
  let providerCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listSubscriptions() {
        return [subscriptionRecord()];
      },
    }),
    whopClient: fakeWhop({
      async createCheckout() {
        providerCalls += 1;
        throw new Error("checkout must not be called");
      },
    }),
    now: () => NOW,
  });
  await assert.rejects(
    service.createCheckout({ userId: TESTER, planId: "ultra" }),
    (error) => error.status === 409 && error.code === "SUBSCRIPTION_ALREADY_ACTIVE",
  );
  assert.equal(providerCalls, 0);
});

test("payment history returns only the store's sanitized account records", async () => {
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listPaymentHistory(userId, limit) {
        assert.equal(userId, TESTER);
        assert.equal(limit, 50);
        return [{
          reference: "ment123456",
          planId: "ultra",
          status: "refunded",
          providerSubstatus: "refunded",
          paidAt: new Date("2026-07-26T12:00:00.000Z"),
          updatedAt: NOW,
        }];
      },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  assert.deepEqual(await service.paymentHistory(TESTER), {
    billingEnabled: true,
    payments: [{
      reference: "ment123456",
      planId: "ultra",
      status: "refunded",
      providerSubstatus: "refunded",
      paidAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:00.000Z",
    }],
  });
});

test("invalid Whop webhook signatures are rejected before storage", async () => {
  let storeCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({ async recordProviderEvent() { storeCalls += 1; } }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  await assert.rejects(
    service.handleWebhook({
      rawBody: Buffer.from("{}"),
      webhookId: "msg_webhook123456",
      webhookTimestamp: epochSeconds(),
      webhookSignature: "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    }),
    (error) => error.status === 401 && error.code === "WEBHOOK_SIGNATURE_INVALID",
  );
  assert.equal(storeCalls, 0);
});

test("signed membership activation is normalized without requiring metadata", async () => {
  let applied;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook(input) { applied = input; return { duplicate: false, applied: true }; },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const result = await signedWebhook(service, "membership.activated", membershipResource());
  assert.equal(result.applied, true);
  assert.equal(applied.customUserId, "");
  assert.equal(applied.checkoutIntentId, "");
  assert.equal(applied.membership.planCode, "plus");
  assert.equal(applied.membership.accessState, "active");
  assert.deepEqual(Object.keys(applied.sanitizedPayload).sort(), ["apiVersion", "companyId", "resourceId"]);
});

test("a checkout completed after account deletion is immediately terminated", async () => {
  let immediateCancellationId = "";
  let confirmed;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook() {
        return {
          duplicate: false,
          applied: false,
          quarantined: true,
          tombstoned: true,
          terminationRequired: true,
        };
      },
      async confirmCheckoutTombstoneTermination(membership) {
        confirmed = membership;
        return true;
      },
    }),
    whopClient: fakeWhop({
      async cancelMembershipImmediately(membershipId) {
        immediateCancellationId = membershipId;
        return membershipResource({
          status: "canceled",
          canceled_at: "2026-07-27T12:00:02.000Z",
          updated_at: "2026-07-27T12:00:02.000Z",
        });
      },
    }),
    now: () => NOW,
  });

  const result = await signedWebhook(
    service,
    "membership.activated",
    membershipResource(),
  );
  assert.equal(result.applied, false);
  assert.equal(result.quarantined, true);
  assert.equal(result.terminationConfirmed, true);
  assert.equal(immediateCancellationId, "mem_membership123456");
  assert.equal(confirmed.accessState, "inactive");
  assert.equal(confirmed.checkoutConfigurationId, "ch_checkout123456");
});

test("deleted-checkout cancellation remains retryable until provider confirmation", async () => {
  let confirmed = false;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook() {
        return {
          duplicate: true,
          applied: false,
          quarantined: true,
          tombstoned: true,
          terminationRequired: true,
        };
      },
      async confirmCheckoutTombstoneTermination() {
        confirmed = true;
      },
    }),
    whopClient: fakeWhop({
      async cancelMembershipImmediately() {
        throw Object.assign(new Error("provider unavailable"), {
          status: 502,
          code: "WHOP_UNAVAILABLE",
        });
      },
    }),
    now: () => NOW,
  });

  await assert.rejects(
    signedWebhook(service, "membership.activated", membershipResource()),
    (error) => error.status === 502 && error.code === "WHOP_UNAVAILABLE",
  );
  assert.equal(confirmed, false);
});

test("deleted-checkout termination rejects a changed provider catalog mapping", async () => {
  let cancellationCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook() {
        return {
          duplicate: false,
          applied: false,
          quarantined: true,
          tombstoned: true,
          terminationRequired: true,
        };
      },
    }),
    whopClient: fakeWhop({
      async retrieveMembership() {
        return membershipResource({
          checkout_configuration_id: "ch_changedcheckout123456",
        });
      },
      async cancelMembershipImmediately() {
        cancellationCalls += 1;
      },
    }),
    now: () => NOW,
  });

  await assert.rejects(
    signedWebhook(service, "membership.activated", membershipResource()),
    (error) =>
      error.status === 502 && error.code === "WHOP_TOMBSTONE_MAPPING_MISMATCH",
  );
  assert.equal(cancellationCalls, 0);
});

test("legacy membership metadata is accepted only as a compatibility hint", async () => {
  let applied;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook(input) {
        applied = input;
        return { duplicate: false, applied: true };
      },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const resource = membershipResource({
    metadata: {
      clerk_user_id: TESTER,
      checkout_intent_id: "11111111-1111-4111-8111-111111111111",
    },
  });
  const result = await signedWebhook(service, "membership.activated", resource);
  assert.equal(result.applied, true);
  assert.equal(applied.customUserId, TESTER);
  assert.equal(
    applied.checkoutIntentId,
    "11111111-1111-4111-8111-111111111111",
  );
});

test("signed events for a different company are quarantined", async () => {
  let recorded;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async recordProviderEvent(input) { recorded = input; return { duplicate: false }; },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const resource = membershipResource();
  resource.company.id = "biz_attacker123456";
  const result = await signedWebhook(service, "membership.activated", resource, "biz_attacker123456");
  assert.equal(result.quarantined, true);
  assert.equal(recorded.reason, "billing_configuration_mismatch");
});

test("signed events for an unconfigured product or plan are quarantined", async () => {
  for (const resource of [
    membershipResource({ product: { id: "prod_attacker123456" } }),
    membershipResource({ plan: { id: "plan_attacker123456" } }),
  ]) {
    let recorded;
    const service = createBillingService({
      config: testConfig(),
      store: fakeStore({
        async recordProviderEvent(input) {
          recorded = input;
          return { duplicate: false };
        },
      }),
      whopClient: fakeWhop(),
      now: () => NOW,
    });
    const result = await signedWebhook(
      service,
      "membership.activated",
      resource,
    );
    assert.equal(result.quarantined, true);
    assert.equal(recorded.reason, "billing_configuration_mismatch");
  }
});

test("signed payment events reject unbounded provider substatus values", async () => {
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore(),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  await assert.rejects(
    signedWebhook(
      service,
      "payment.succeeded",
      paymentResource("succeeded", "x".repeat(65)),
    ),
    (error) => error.status === 400 && error.code === "WEBHOOK_PAYLOAD_INVALID",
  );
});

test("signed payment events reject malformed statutory transaction fields", async () => {
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore(),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  await assert.rejects(
    signedWebhook(
      service,
      "payment.succeeded",
      paymentResource("paid", "succeeded", { settlement_amount: "5.00" }),
    ),
    (error) => error.status === 400 && error.code === "WEBHOOK_PAYLOAD_INVALID",
  );
});

test("payment.failed immediately removes paid access through the store", async () => {
  let failedInput;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyPaymentStateWebhook(input) { failedInput = input; return { duplicate: false, applied: true }; },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const result = await signedWebhook(
    service,
    "payment.failed",
    paymentResource("failed", "failed", { checkout_configuration_id: null }),
  );
  assert.equal(result.applied, true);
  assert.equal(failedInput.payment.membershipId, "mem_membership123456");
  assert.equal(failedInput.payment.planId, "plan_QzpD3pxTswPLX");
  assert.equal(failedInput.accessState, "payment_failed");
});

test("payment.succeeded refreshes Whop membership and advances the quota cycle", async () => {
  let applied;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook(input) { applied = input; return { duplicate: false, applied: true }; },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const result = await signedWebhook(service, "payment.succeeded", paymentResource("succeeded"));
  assert.equal(result.applied, true);
  assert.equal(applied.membership.id, "mem_membership123456");
  assert.equal(applied.payment.planCode, "plus");
  assert.equal(applied.payment.displayStatus, "paid");
  assert.equal(applied.payment.settlementAmount, 5);
  assert.equal(applied.payment.currency, "usd");
  assert.equal(applied.payment.taxAmount, 0.45);
  assert.equal(applied.payment.taxBehavior, "exclusive");
  assert.equal(applied.payment.billingReason, "subscription_create");
  assert.equal(applied.cycleStartedAt.toISOString(), "2026-07-27T12:00:00.000Z");
});

test("payment evidence accepts Whop final_amount when settlement_amount is absent", async () => {
  let applied;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook(input) {
        applied = input;
        return { duplicate: false, applied: true };
      },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });

  const result = await signedWebhook(
    service,
    "payment.succeeded",
    paymentResource("succeeded", "succeeded", {
      settlement_amount: null,
      final_amount: 7,
    }),
  );
  assert.equal(result.applied, true);
  assert.equal(applied.payment.settlementAmount, 7);
});

test("cancellation is server-side, at period end, and retains the expiry", async () => {
  let synced;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listSubscriptions() {
        return [{
          id: "mem_membership123456",
          providerPlanId: "plan_QzpD3pxTswPLX",
          providerProductId: "prod_M3Wts8bsfX4mK",
          providerStatus: "active",
          status: "active",
          periodStartedAt: "2026-07-27T12:00:00.000Z",
          renewsAt: "2026-08-27T12:00:00.000Z",
          endsAt: "2026-08-27T12:00:00.000Z",
          cancelAtPeriodEnd: false,
          updatedAt: "2026-07-27T12:00:01.000Z",
        }];
      },
      async syncMappedMembership(input) { synced = input; return true; },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const result = await service.cancelMembership({ userId: TESTER, planId: "plus" });
  assert.equal(result.cancelAtPeriodEnd, true);
  assert.equal(result.endsAt, "2026-08-27T12:00:00.000Z");
  assert.equal(synced.accessState, "cancel_at_period_end");
});

test("a canceled renewal can be reactivated while its paid period is active", async () => {
  let uncanceledId = "";
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listSubscriptions() {
        return [subscriptionRecord({
          status: "cancel_at_period_end",
          providerStatus: "canceling",
          cancelAtPeriodEnd: true,
          renewsAt: null,
        })];
      },
    }),
    whopClient: fakeWhop({
      async uncancelMembership(id) {
        uncanceledId = id;
        return membershipResource();
      },
    }),
    now: () => NOW,
  });
  const result = await service.reactivateMembership({
    userId: TESTER,
    planId: "plus",
  });
  assert.equal(uncanceledId, "mem_membership123456");
  assert.equal(result.cancelAtPeriodEnd, false);
  assert.equal(result.renewsAt, "2026-08-27T12:00:00.000Z");
});

test("a legacy overlapping account falls back safely when Ultra is revoked", async () => {
  const plus = subscriptionRecord();
  const ultra = subscriptionRecord({
    id: "mem_ultramembership123456",
    providerPlanId: "plan_FZknYvJ1uz41F",
    providerProductId: "prod_kIiWFLHOWhrWa",
    status: "revoked",
    updatedAt: "2026-07-27T12:00:02.000Z",
  });
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({ async listSubscriptions() { return [plus, ultra]; } }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const status = await service.status(TESTER);
  assert.equal(status.plan.id, "plus");
  assert.equal(status.subscription.planId, "plus");
  assert.equal(status.subscriptions.length, 2);
  assert.equal(
    status.subscriptions.find((item) => item.planId === "ultra").status,
    "revoked",
  );
});

test("dispute.created revokes only the payment's mapped membership", async () => {
  let held;
  let canceledMembershipId = "";
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyPaymentStateWebhook(input) {
        held = input;
        return { duplicate: false, applied: true };
      },
    }),
    whopClient: fakeWhop({
      async retrievePayment() {
        return paymentResource("unresolved", "dispute_needs_response");
      },
      async cancelMembershipAtPeriodEnd(membershipId) {
        canceledMembershipId = membershipId;
        return membershipResource({
          status: "canceling",
          cancel_at_period_end: true,
        });
      },
    }),
    now: () => NOW,
  });
  const result = await signedWebhook(service, "dispute.created", {
    id: "dspt_dispute123456",
    status: "needs_response",
    payment: { id: "pay_payment123456" },
  });
  assert.equal(result.applied, true);
  assert.equal(held.accessState, "revoked");
  assert.equal(held.payment.membershipId, "mem_membership123456");
  assert.equal(held.payment.displayStatus, "disputed");
  assert.equal(held.sanitizedPayload.resourceId, "pay_payment123456");
  assert.equal(
    held.payment.disputedAt.toISOString(),
    "2026-07-27T12:00:01.000Z",
  );
  assert.equal(canceledMembershipId, "mem_membership123456");
});

test("duplicate adverse webhooks still retry automatic renewal cancellation", async () => {
  let cancellationCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyPaymentStateWebhook() {
        return { duplicate: true, applied: false };
      },
    }),
    whopClient: fakeWhop({
      async cancelMembershipAtPeriodEnd() {
        cancellationCalls += 1;
        return membershipResource({
          status: "canceling",
          cancel_at_period_end: true,
        });
      },
    }),
    now: () => NOW,
  });
  const result = await signedWebhook(service, "refund.created", {
    id: "rfnd_refund123456",
    status: "succeeded",
    payment: { id: "pay_payment123456" },
  });
  assert.equal(result.duplicate, true);
  assert.equal(cancellationCalls, 1);
});

test("adverse webhooks do not recancel a renewal already ending", async () => {
  let cancellationCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore(),
    whopClient: fakeWhop({
      async retrieveMembership() {
        return membershipResource({
          status: "canceling",
          cancel_at_period_end: true,
        });
      },
      async cancelMembershipAtPeriodEnd() {
        cancellationCalls += 1;
        throw new Error("must not recancel");
      },
    }),
    now: () => NOW,
  });
  const result = await signedWebhook(service, "refund.created", {
    id: "rfnd_refund123456",
    status: "succeeded",
    payment: { id: "pay_payment123456" },
  });
  assert.equal(result.applied, true);
  assert.equal(cancellationCalls, 0);
});

test("provider cancellation failure is retryable after local access is revoked", async () => {
  let localRevocationApplied = false;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyPaymentStateWebhook() {
        localRevocationApplied = true;
        return { duplicate: false, applied: true };
      },
    }),
    whopClient: fakeWhop({
      async cancelMembershipAtPeriodEnd() {
        throw Object.assign(new Error("provider unavailable"), {
          status: 502,
          code: "WHOP_UNAVAILABLE",
        });
      },
    }),
    now: () => NOW,
  });
  await assert.rejects(
    signedWebhook(service, "refund.created", {
      id: "rfnd_refund123456",
      status: "succeeded",
      payment: { id: "pay_payment123456" },
    }),
    (error) => error.status === 502 && error.code === "WHOP_UNAVAILABLE",
  );
  assert.equal(localRevocationApplied, true);
});

test("a won dispute restores access through an authoritative membership refresh", async () => {
  let restored;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyMembershipWebhook(input) {
        restored = input;
        return { duplicate: false, applied: true };
      },
    }),
    whopClient: fakeWhop(),
    now: () => NOW,
  });
  const result = await signedWebhook(service, "dispute.updated", {
    id: "dspt_dispute123456",
    status: "won",
    payment: { id: "pay_payment123456" },
  });
  assert.equal(result.applied, true);
  assert.equal(restored.allowAccessRestore, true);
  assert.equal(restored.membership.id, "mem_membership123456");
});

test("automatic reconciliation recovers a paid checkout whose activation webhook was missed", async () => {
  let applied;
  const intent = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: TESTER,
    planCode: "plus",
    companyId: "biz_745hMbzbWHtrZr",
    productId: "prod_M3Wts8bsfX4mK",
    planId: "plan_QzpD3pxTswPLX",
    checkoutConfigurationId: "ch_checkout123456",
    createdAt: new Date("2026-07-27T11:59:00.000Z"),
  };
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listRecoverableCheckoutIntents() { return [intent]; },
      async applyMembershipWebhook(input) {
        applied = input;
        return { duplicate: false, applied: true };
      },
    }),
    whopClient: fakeWhop({
      async listPaymentsSince() {
        return [paymentResource("paid", "succeeded", {
          created_at: "2026-07-27T12:00:00.000Z",
          updated_at: "2026-07-27T12:00:01.000Z",
        })];
      },
    }),
    now: () => NOW,
  });
  const result = await service.reconcile();
  assert.equal(result.recovered, 1);
  assert.equal(result.failed, 0);
  assert.equal(applied.customUserId, TESTER);
  assert.equal(applied.checkoutIntentId, intent.id);
  assert.equal(applied.allowAccessRestore, true);
});

test("automatic reconciliation drains pending deleted-checkout terminations", async () => {
  let confirmed = 0;
  let canceled = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listPendingCheckoutTombstones() {
        return [{
          checkoutConfigurationId: "ch_checkout123456",
          membershipId: "mem_membership123456",
          companyId: "biz_745hMbzbWHtrZr",
          productId: "prod_M3Wts8bsfX4mK",
          planId: "plan_QzpD3pxTswPLX",
          planCode: "plus",
          updatedAt: NOW,
        }];
      },
      async confirmCheckoutTombstoneTermination() {
        confirmed += 1;
        return true;
      },
    }),
    whopClient: fakeWhop({
      async cancelMembershipImmediately() {
        canceled += 1;
        return membershipResource({
          status: "canceled",
          canceled_at: "2026-07-27T12:00:02.000Z",
          updated_at: "2026-07-27T12:00:02.000Z",
        });
      },
    }),
    now: () => NOW,
  });

  const result = await service.reconcile();
  assert.equal(result.failed, 0);
  assert.equal(canceled, 1);
  assert.equal(confirmed, 1);
});

test("automatic reconciliation revokes a mapped membership when a refund webhook was missed", async () => {
  let held;
  let cancellationCalls = 0;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listMappedMembershipIds() {
        return ["mem_membership123456"];
      },
      async applyPaymentStateWebhook(input) {
        held = input;
        return { duplicate: false, applied: true };
      },
    }),
    whopClient: fakeWhop({
      async listPaymentsSince() {
        return [paymentResource("paid", "refunded", {
          updated_at: "2026-07-27T12:00:01.000Z",
        })];
      },
      async cancelMembershipAtPeriodEnd() {
        cancellationCalls += 1;
        return membershipResource({
          status: "canceling",
          cancel_at_period_end: true,
        });
      },
    }),
    now: () => NOW,
  });
  const result = await service.reconcile();
  assert.equal(result.paymentStatesUpdated, 1);
  assert.equal(result.failed, 0);
  assert.equal(held.accessState, "revoked");
  assert.equal(held.payment.membershipId, "mem_membership123456");
  assert.equal(cancellationCalls, 1);
});

test("reconciliation queries both current and legacy plan IDs", async () => {
  let queriedPlanIds = [];
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore(),
    whopClient: fakeWhop({
      async listPaymentsSince(_updatedAfter, options) {
        queriedPlanIds = options.planIds;
        return [];
      },
    }),
    now: () => NOW,
  });
  const result = await service.reconcile();
  assert.equal(result.failed, 0);
  assert.deepEqual(new Set(queriedPlanIds), new Set([
    "plan_newplus123456",
    "plan_QzpD3pxTswPLX",
    "plan_newultra123456",
    "plan_FZknYvJ1uz41F",
  ]));
});

test("reconciliation closes a terminated membership created under a legacy plan", async () => {
  let synchronized;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listMappedMembershipIds() {
        return ["mem_membership123456"];
      },
      async syncMappedMembership(membership) {
        synchronized = membership;
        return true;
      },
    }),
    whopClient: fakeWhop({
      async retrieveMembership() {
        return membershipResource({ status: "canceled" });
      },
    }),
    now: () => NOW,
  });
  const result = await service.reconcile();
  assert.equal(result.failed, 0);
  assert.equal(result.updated, 1);
  assert.equal(synchronized.planCode, "plus");
  assert.equal(synchronized.planId, "plan_QzpD3pxTswPLX");
  assert.equal(synchronized.accessState, "inactive");
});

test("reconciliation durably retries adverse-payment renewal cancellation", async () => {
  let cancellationCalls = 0;
  let synchronized;
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async listAdverseRenewalCancellationIds() {
        return ["mem_membership123456"];
      },
      async syncMappedMembership(membership) {
        synchronized = membership;
        return true;
      },
    }),
    whopClient: fakeWhop({
      async cancelMembershipAtPeriodEnd() {
        cancellationCalls += 1;
        return membershipResource({
          status: "canceling",
          cancel_at_period_end: true,
        });
      },
    }),
    now: () => NOW,
  });
  const result = await service.reconcile();
  assert.equal(result.failed, 0);
  assert.equal(result.renewalsCanceled, 1);
  assert.equal(cancellationCalls, 1);
  assert.equal(synchronized.cancelAtPeriodEnd, true);
});

test("reconciliation reports only a safe PostgreSQL SQLSTATE", async () => {
  const service = createBillingService({
    config: testConfig(),
    store: fakeStore({
      async applyPaymentStateWebhook() {
        throw Object.assign(new Error("sensitive database detail"), {
          code: "BILLING_DATABASE_UNAVAILABLE",
          databaseCode: "22P02",
        });
      },
    }),
    whopClient: fakeWhop({
      async listPaymentsSince() {
        return [paymentResource("paid", "refunded", {
          updated_at: "2026-07-27T12:00:01.000Z",
        })];
      },
    }),
    now: () => NOW,
  });
  const result = await service.reconcile();
  assert.equal(result.failed, 1);
  assert.deepEqual(result.failures, [{
    stage: "payment",
    code: "BILLING_DATABASE_UNAVAILABLE",
    databaseCode: "22P02",
    providerStatus: undefined,
    providerType: undefined,
  }]);
  assert.equal(JSON.stringify(result).includes("sensitive database detail"), false);
});

function subscriptionRecord(overrides = {}) {
  return {
    id: "mem_membership123456",
    providerPlanId: "plan_QzpD3pxTswPLX",
    providerProductId: "prod_M3Wts8bsfX4mK",
    providerStatus: "active",
    status: "active",
    periodStartedAt: "2026-07-27T12:00:00.000Z",
    renewsAt: "2026-08-27T12:00:00.000Z",
    endsAt: "2026-08-27T12:00:00.000Z",
    cancelAtPeriodEnd: false,
    updatedAt: "2026-07-27T12:00:01.000Z",
    ...overrides,
  };
}

function membershipResource(overrides = {}) {
  return {
    id: "mem_membership123456",
    status: "active",
    company: { id: "biz_745hMbzbWHtrZr" },
    product: { id: "prod_M3Wts8bsfX4mK" },
    plan: { id: "plan_QzpD3pxTswPLX" },
    member: { id: "mber_member123456" },
    user: { id: "user_whopuser123456" },
    renewal_period_start: "2026-07-27T12:00:00.000Z",
    renewal_period_end: "2026-08-27T12:00:00.000Z",
    cancel_at_period_end: false,
    canceled_at: null,
    checkout_configuration_id: "ch_checkout123456",
    created_at: "2026-07-27T12:00:00.000Z",
    updated_at: "2026-07-27T12:00:01.000Z",
    ...overrides,
  };
}

function paymentResource(status, substatus = status, overrides = {}) {
  return {
    id: "pay_payment123456",
    status,
    substatus,
    company: { id: "biz_745hMbzbWHtrZr" },
    product: { id: "prod_M3Wts8bsfX4mK" },
    plan: { id: "plan_QzpD3pxTswPLX" },
    membership: { id: "mem_membership123456" },
    checkout_configuration_id: "ch_checkout123456",
    settlement_amount: 5,
    settlement_currency: "usd",
    tax_amount: 0.45,
    tax_behavior: "exclusive",
    billing_reason: "subscription_create",
    paid_at: "2026-07-27T12:00:00.000Z",
    created_at: "2026-07-27T12:00:00.000Z",
    updated_at: "2026-07-27T12:00:01.000Z",
    ...overrides,
  };
}

async function signedWebhook(service, type, data, companyId = "biz_745hMbzbWHtrZr") {
  const id = "msg_webhook123456";
  const timestamp = epochSeconds();
  const body = {
    id,
    api_version: "v1",
    api_version_date: "2026-07-20",
    timestamp: NOW.toISOString(),
    type,
    data,
    company_id: companyId,
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  return service.handleWebhook({
    rawBody,
    webhookId: id,
    webhookTimestamp: timestamp,
    webhookSignature: signatureFor(id, timestamp, rawBody),
  });
}

function epochSeconds() {
  return String(Math.floor(NOW.getTime() / 1000));
}

function signatureFor(id, timestamp, rawBody) {
  return `v1,${createHmac("sha256", WEBHOOK_SECRET)
    .update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`), rawBody]))
    .digest("base64")}`;
}
