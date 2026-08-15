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
  settlementAmount: 5,
  currency: "usd",
  taxAmount: 0.45,
  taxBehavior: "exclusive",
  billingReason: "subscription_create",
  paidAt: new Date("2026-07-27T00:00:00.000Z"),
  createdAt: new Date("2026-07-27T00:00:00.000Z"),
  updatedAt: new Date("2026-07-27T00:00:05.000Z"),
  refundedAt: new Date("2026-07-27T00:00:05.000Z"),
  disputedAt: null,
};

const MEMBERSHIP = {
  id: "mem_membership123456",
  companyId: PAYMENT.companyId,
  productId: PAYMENT.productId,
  planId: PAYMENT.planId,
  planCode: "plus",
  providerStatus: "active",
  accessState: "active",
  memberId: "mber_member123456",
  userId: "user_whopuser123456",
  renewalPeriodStart: new Date("2026-07-27T00:00:00.000Z"),
  renewalPeriodEnd: new Date("2026-08-27T00:00:00.000Z"),
  cancelAtPeriodEnd: false,
  canceledAt: null,
  checkoutConfigurationId: PAYMENT.checkoutConfigurationId,
  createdAt: new Date("2026-07-27T00:00:00.000Z"),
  updatedAt: new Date("2026-07-27T00:00:01.000Z"),
};

test("adverse renewal cancellation backlog is bounded and database-backed", async () => {
  let observedSql = "";
  let observedParameters;
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      observedSql = sql;
      observedParameters = parameters;
      return {
        rows: [{ provider_membership_id: "mem_membership123456" }],
      };
    }),
    providerMode: "live",
  });

  const ids = await store.listAdverseRenewalCancellationIds(25);
  assert.deepEqual(ids, ["mem_membership123456"]);
  assert.match(observedSql, /access_state = 'revoked'/);
  assert.match(observedSql, /cancel_at_period_end = false/);
  assert.deepEqual(observedParameters, ["live", 25]);
});

test("a statutory archive ownership conflict is exposed only as a safe billing error", async () => {
  const databaseError = Object.assign(
    new Error("PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT"),
    { code: "P0001" },
  );
  const store = createPostgresBillingStore({
    pool: scriptedPool(() => { throw databaseError; }),
    providerMode: "test",
  });

  await assert.rejects(
    store.createCheckoutIntent({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user_ArchiveConflict123",
      planCode: "plus",
      companyId: PAYMENT.companyId,
      productId: PAYMENT.productId,
      providerPlanId: PAYMENT.planId,
      expiresAt: new Date("2026-07-27T01:00:00.000Z"),
    }),
    (error) =>
      error.status === 503 &&
      error.code === "BILLING_LEGAL_ARCHIVE_CONFLICT" &&
      !String(error.message).includes("P0001"),
  );
});

test("pending deleted-checkout terminations are bounded and de-identified", async () => {
  let observedSql = "";
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      observedSql = sql;
      return { rows: [checkoutTombstoneRow({
        provider_membership_id: MEMBERSHIP.id,
      })] };
    }),
    providerMode: "test",
  });

  const pending = await store.listPendingCheckoutTombstones(12);
  assert.deepEqual(pending, [{
    checkoutConfigurationId: PAYMENT.checkoutConfigurationId,
    membershipId: MEMBERSHIP.id,
    companyId: PAYMENT.companyId,
    productId: PAYMENT.productId,
    planId: PAYMENT.planId,
    planCode: PAYMENT.planCode,
    updatedAt: null,
  }]);
  assert.match(observedSql, /termination_state = 'pending'/);
  assert.doesNotMatch(observedSql, /clerk_user_id|email/i);
});

test("checkout and quota transactions fail closed for a deletion-blocked user", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool(
      (sql) => {
        queries.push(sql);
        if (sql.startsWith("SELECT clerk_user_id FROM billing_checkout_sessions")) {
          return { rows: [{ clerk_user_id: "user_CheckoutTester123" }] };
        }
        return { rows: [] };
      },
      { deletionBlocked: true },
    ),
    providerMode: "test",
  });

  await assert.rejects(
    store.createCheckoutIntent({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user_CheckoutTester123",
      planCode: "plus",
      companyId: PAYMENT.companyId,
      productId: PAYMENT.productId,
      providerPlanId: PAYMENT.planId,
      expiresAt: new Date("2026-07-27T01:00:00.000Z"),
    }),
    deletionBlockedError,
  );
  await assert.rejects(
    store.reserveUsage({
      userId: "user_CheckoutTester123",
      operationId: "22222222-2222-4222-8222-222222222222",
      planId: "free",
      model: "grok-4.3",
      period: {
        key: "free:2026-07-27",
        allowance: 5,
        startsAt: new Date("2026-07-27T00:00:00.000Z"),
        endsAt: new Date("2026-07-28T00:00:00.000Z"),
      },
    }),
    deletionBlockedError,
  );
  await assert.rejects(
    store.markCheckoutCreated(
      "11111111-1111-4111-8111-111111111111",
      PAYMENT.checkoutConfigurationId,
      "https://whop.com/checkout/test",
    ),
    deletionBlockedError,
  );
  assert.equal(
    queries.some(
      (sql) =>
        /INSERT INTO billing_(checkout_sessions|usage_periods)/.test(sql) ||
        sql.startsWith("UPDATE billing_checkout_sessions SET status = 'checkout_created'"),
    ),
    false,
  );
});

test("the durable deletion guard blocks writes after the raw queue is removed", async () => {
  const order = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) order.push("lock");
      return { rows: [] };
    }),
    providerMode: "test",
    async deletionGuard(userId) {
      order.push(`guard:${userId}`);
      return "complete";
    },
  });

  await assert.rejects(
    store.createCheckoutIntent({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user_CheckoutTester123",
      planCode: "plus",
      companyId: PAYMENT.companyId,
      productId: PAYMENT.productId,
      providerPlanId: PAYMENT.planId,
      expiresAt: new Date("2026-07-27T01:00:00.000Z"),
    }),
    deletionBlockedError,
  );
  assert.deepEqual(order, ["lock", "guard:user_CheckoutTester123"]);
});

test("membership webhook application fails closed after checkout ownership is known", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool(
      (sql) => {
        queries.push(sql);
        if (sql.startsWith("INSERT INTO billing_provider_events")) {
          return { rows: [{ payload_digest: "d".repeat(64) }] };
        }
        if (sql.startsWith("SELECT clerk_user_id, provider_member_id")) {
          return { rows: [] };
        }
        if (sql.startsWith("SELECT id, clerk_user_id")) {
          return { rows: [checkoutRow()] };
        }
        return { rows: [] };
      },
      { deletionBlocked: true },
    ),
    providerMode: "test",
  });

  await assert.rejects(
    store.applyMembershipWebhook(membershipInput()),
    deletionBlockedError,
  );
  assert.equal(
    queries.some((sql) => sql.startsWith("INSERT INTO billing_memberships")),
    false,
  );
});

test("payment webhook application fails closed after membership ownership is known", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool(
      (sql) => {
        queries.push(sql);
        if (sql.startsWith("INSERT INTO billing_provider_events")) {
          return { rows: [{ payload_digest: "e".repeat(64) }] };
        }
        if (sql.startsWith("SELECT clerk_user_id, provider_member_id")) {
          return {
            rows: [{
              clerk_user_id: "user_CheckoutTester123",
              company_id: PAYMENT.companyId,
              product_id: PAYMENT.productId,
              plan_id: PAYMENT.planId,
              state_changed_at: new Date("2026-07-27T00:00:00.000Z"),
            }],
          };
        }
        return { rows: [] };
      },
      { deletionBlocked: true },
    ),
    providerMode: "test",
  });

  await assert.rejects(
    store.applyPaymentStateWebhook(paymentStateInput()),
    deletionBlockedError,
  );
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE billing_memberships")),
    false,
  );
});

test("an older adverse-payment replay is ignored without querying an empty UUID", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_memberships")) return { rows: [] };
        if (sql.startsWith("SELECT clerk_user_id, provider_member_id")) {
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
  assert.ok(
    queries.findIndex((sql) => sql.startsWith("SELECT pg_advisory_xact_lock")) <
      queries.findIndex(
        (sql) =>
          sql.includes("FROM billing_memberships") &&
          sql.includes("FOR UPDATE"),
      ),
    "the per-user advisory lock must precede billing row locks",
  );
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

test("a late refund updates only the legal archive after live account rows are gone", async () => {
  const queries = [];
  let archiveParameters;
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      queries.push(sql);
      if (sql.startsWith("SELECT record_id, record_category")) {
        return { rows: [archivedPaymentRow()] };
      }
      if (sql.startsWith("INSERT INTO legal_retention.transaction_records")) {
        archiveParameters = parameters;
        return { rowCount: 1, rows: [{ record_id: parameters[0] }] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const result = await store.applyPaymentStateWebhook(paymentStateInput());
  assert.deepEqual(
    result,
    { duplicate: false, applied: false, archived: true },
  );
  assert.equal(archiveParameters[1], "contract_withdrawal");
  assert.equal(archiveParameters[9], PAYMENT.id);
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE billing_memberships")),
    false,
  );
  assert.ok(
    queries.findIndex(
      (sql) =>
        sql.startsWith("SELECT record_id, record_category") &&
        sql.includes("FOR UPDATE"),
    ) < queries.findIndex((sql) => sql.startsWith("INSERT INTO billing_provider_events")),
    "archive rows must be locked before recording the provider event",
  );
});

test("a late resolved dispute updates archive evidence without restoring entitlement", async () => {
  let archiveParameters;
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      if (sql.startsWith("SELECT record_id, record_category")) {
        return { rows: [archivedPaymentRow()] };
      }
      if (sql.startsWith("INSERT INTO legal_retention.transaction_records")) {
        archiveParameters = parameters;
        return { rowCount: 1, rows: [{ record_id: parameters[0] }] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "f".repeat(64) }] };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const result = await store.applyMembershipWebhook(membershipInput({
    deliveryId: "msg_disputeresolved123456",
    eventName: "dispute.updated",
    payloadDigest: "f".repeat(64),
    payment: {
      ...PAYMENT,
      substatus: "dispute_won",
      displayStatus: "paid",
      refundedAt: null,
      disputedAt: null,
    },
  }));
  assert.deepEqual(
    result,
    { duplicate: false, applied: false, archived: true },
  );
  assert.equal(archiveParameters[1], "complaint_dispute");
});

test("an older late payment replay cannot overwrite newer archive evidence", async () => {
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      if (sql.startsWith("SELECT record_id, record_category")) {
        return { rows: [archivedPaymentRow()] };
      }
      if (sql.startsWith("INSERT INTO legal_retention.transaction_records")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  assert.deepEqual(
    await store.applyPaymentStateWebhook(paymentStateInput()),
    {
      duplicate: false,
      applied: false,
      archived: false,
      stale: true,
    },
  );
});

test("a new membership maps by provider checkout and ignores spoofed metadata", async () => {
  const queries = [];
  let membershipParameters;
  let paymentHistoryParameters;
  let checkoutLookups = 0;
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "b".repeat(64) }] };
      }
      if (sql.startsWith("SELECT clerk_user_id, provider_member_id")) {
        return { rows: [] };
      }
      if (sql.startsWith("SELECT id, clerk_user_id")) {
        checkoutLookups += 1;
        return { rows: [checkoutRow()] };
      }
      if (sql.startsWith("SELECT provider_membership_id FROM billing_memberships")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_memberships")) {
        membershipParameters = parameters;
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_payment_history")) {
        paymentHistoryParameters = parameters;
        return {
          rowCount: 1,
          rows: [{ clerk_user_id: "user_CheckoutTester123" }],
        };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const input = membershipInput({
    customUserId: "user_SpoofedAttacker123",
    checkoutIntentId: "22222222-2222-4222-8222-222222222222",
    payment: {
      ...PAYMENT,
      substatus: "succeeded",
      displayStatus: "paid",
      createdAt: null,
      updatedAt: null,
      refundedAt: null,
    },
  });
  const result = await store.applyMembershipWebhook(input);
  assert.deepEqual(result, { duplicate: false, applied: true });
  assert.equal(checkoutLookups, 2);
  assert.equal(membershipParameters[1], "user_CheckoutTester123");
  assert.equal(paymentHistoryParameters[4], PAYMENT.checkoutConfigurationId);
  assert.equal(paymentHistoryParameters[5], PAYMENT.companyId);
  assert.equal(paymentHistoryParameters[11], 5);
  assert.equal(paymentHistoryParameters[12], "usd");
  assert.equal(paymentHistoryParameters[13], 0.45);
  assert.equal(
    paymentHistoryParameters[18],
    input.eventTimestamp,
    "verified webhook time must replace an absent provider payment timestamp",
  );
  assert.ok(
    queries.findIndex((sql) => sql.startsWith("SELECT pg_advisory_xact_lock")) <
      queries.findIndex(
        (sql) =>
          sql.includes("FROM billing_checkout_sessions") &&
          sql.includes("FOR UPDATE"),
      ),
    "the per-user advisory lock must precede billing row locks",
  );
  assert.equal(
    queries.some((sql) => sql.includes("WHERE provider_mode = $1 AND id = $2")),
    false,
  );
});

test("a membership with an unknown provider checkout is quarantined", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "b".repeat(64) }] };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const result = await store.applyMembershipWebhook(membershipInput());
  assert.deepEqual(
    result,
    { duplicate: false, applied: false, quarantined: true },
  );
  assert.equal(
    queries.some((sql) => sql.startsWith("INSERT INTO billing_memberships")),
    false,
  );
});

test("a deleted-account checkout tombstone blocks entitlement creation", async () => {
  const queries = [];
  let eventReason = "";
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      queries.push(sql);
      if (
        sql.startsWith("SELECT provider_checkout_id, prior_membership_ids") &&
        sql.includes("FROM billing_checkout_tombstones")
      ) {
        return { rows: [checkoutTombstoneRow()] };
      }
      if (sql.startsWith("SELECT payload_digest FROM billing_provider_events")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "b".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_checkout_tombstones AS tombstone")) {
        return { rowCount: 1, rows: [{ provider_checkout_id: PAYMENT.checkoutConfigurationId }] };
      }
      if (sql.startsWith("UPDATE billing_provider_events")) {
        eventReason = parameters[3];
      }
      return { rows: [], rowCount: 0 };
    }),
    providerMode: "test",
  });

  const result = await store.applyMembershipWebhook(membershipInput());
  assert.deepEqual(result, {
    duplicate: false,
    applied: false,
    quarantined: true,
    tombstoned: true,
    terminationRequired: true,
  });
  assert.equal(eventReason, "deleted_account_checkout_completed");
  assert.equal(
    queries.some((sql) => sql.startsWith("INSERT INTO billing_memberships")),
    false,
  );
  assert.equal(
    queries.some((sql) => sql.startsWith("SELECT id, clerk_user_id")),
    false,
  );
});

test("a tombstoned original membership keeps period-end cancellation semantics", async () => {
  let eventReason = "";
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      if (
        sql.startsWith("SELECT provider_checkout_id, prior_membership_ids") &&
        sql.includes("FROM billing_checkout_tombstones")
      ) {
        return { rows: [checkoutTombstoneRow({
          prior_membership_ids: [MEMBERSHIP.id],
        })] };
      }
      if (sql.startsWith("SELECT payload_digest FROM billing_provider_events")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "b".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_provider_events")) {
        eventReason = parameters[3];
      }
      return { rows: [], rowCount: 0 };
    }),
    providerMode: "test",
  });

  assert.deepEqual(await store.applyMembershipWebhook(membershipInput()), {
    duplicate: false,
    applied: false,
    quarantined: true,
    tombstoned: true,
    terminationRequired: false,
  });
  assert.equal(eventReason, "deleted_account_original_membership_event");
});

test("reusing a deleted paid account checkout targets only the new membership", async () => {
  const reusedMembership = {
    ...MEMBERSHIP,
    id: "mem_reusedcheckout123456",
    updatedAt: new Date("2026-07-28T00:00:00.000Z"),
  };
  let tombstoneUpdateParameters;
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      if (
        sql.startsWith("SELECT provider_checkout_id, prior_membership_ids") &&
        sql.includes("FROM billing_checkout_tombstones")
      ) {
        return { rows: [checkoutTombstoneRow({
          prior_membership_ids: [MEMBERSHIP.id],
        })] };
      }
      if (sql.startsWith("SELECT payload_digest FROM billing_provider_events")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "b".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_checkout_tombstones AS tombstone")) {
        tombstoneUpdateParameters = parameters;
        return {
          rowCount: 1,
          rows: [{ provider_checkout_id: PAYMENT.checkoutConfigurationId }],
        };
      }
      return { rows: [], rowCount: 0 };
    }),
    providerMode: "test",
  });

  assert.deepEqual(
    await store.applyMembershipWebhook(membershipInput({
      membership: reusedMembership,
    })),
    {
      duplicate: false,
      applied: false,
      quarantined: true,
      tombstoned: true,
      terminationRequired: true,
    },
  );
  assert.equal(tombstoneUpdateParameters[2], reusedMembership.id);
  assert.notEqual(tombstoneUpdateParameters[2], MEMBERSHIP.id);
});

test("a duplicate tombstoned activation keeps retrying pending termination", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      queries.push(sql);
      if (
        sql.startsWith("SELECT provider_checkout_id, prior_membership_ids") &&
        sql.includes("FROM billing_checkout_tombstones")
      ) {
        return { rows: [checkoutTombstoneRow({
          provider_membership_id: MEMBERSHIP.id,
          termination_state: "pending",
        })] };
      }
      if (sql.startsWith("SELECT payload_digest FROM billing_provider_events")) {
        return { rows: [{ payload_digest: "b".repeat(64) }] };
      }
      return { rows: [], rowCount: 0 };
    }),
    providerMode: "test",
  });

  const result = await store.applyMembershipWebhook(membershipInput());
  assert.equal(result.duplicate, true);
  assert.equal(result.tombstoned, true);
  assert.equal(result.terminationRequired, true);
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE billing_checkout_tombstones")),
    false,
  );
});

test("a tombstone catalog mismatch is quarantined without entitlement", async () => {
  let eventReason = "";
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      if (
        sql.startsWith("SELECT provider_checkout_id, prior_membership_ids") &&
        sql.includes("FROM billing_checkout_tombstones")
      ) {
        return { rows: [checkoutTombstoneRow({ plan_id: "plan_newultra123456" })] };
      }
      if (sql.startsWith("SELECT payload_digest FROM billing_provider_events")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "b".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_provider_events")) {
        eventReason = parameters[3];
      }
      return { rows: [], rowCount: 0 };
    }),
    providerMode: "test",
  });

  const result = await store.applyMembershipWebhook(membershipInput());
  assert.equal(result.quarantined, true);
  assert.equal(result.tombstoned, true);
  assert.equal(result.terminationRequired, true);
  assert.equal(result.terminationConfirmationRequired, false);
  assert.equal(eventReason, "checkout_tombstone_catalog_mismatch");
});

test("legacy metadata can recover a pre-ID checkout without overriding catalog checks", async () => {
  let checkoutLookups = 0;
  let membershipParameters;
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "c".repeat(64) }] };
      }
      if (sql.startsWith("SELECT clerk_user_id, provider_member_id")) {
        return { rows: [] };
      }
      if (sql.startsWith("SELECT id, clerk_user_id")) {
        checkoutLookups += 1;
        return sql.includes("AND provider_checkout_id = $2")
          ? { rows: [] }
          : { rows: [{ ...checkoutRow(), provider_checkout_id: null, status: "pending" }] };
      }
      if (sql.startsWith("SELECT provider_membership_id FROM billing_memberships")) {
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO billing_memberships")) {
        membershipParameters = parameters;
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });

  const result = await store.applyMembershipWebhook(
    membershipInput({
      customUserId: "user_CheckoutTester123",
      checkoutIntentId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.deepEqual(result, { duplicate: false, applied: true });
  assert.equal(checkoutLookups, 4);
  assert.equal(membershipParameters[1], "user_CheckoutTester123");
});

test("a failed payment maps by provider checkout and ignores spoofed metadata", async () => {
  const queries = [];
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql) => {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      if (sql.startsWith("SELECT id, clerk_user_id")) {
        return {
          rows: [{
            id: "11111111-1111-4111-8111-111111111111",
            clerk_user_id: "user_CheckoutTester123",
            requested_plan: "plus",
            company_id: PAYMENT.companyId,
            product_id: PAYMENT.productId,
            plan_id: PAYMENT.planId,
            provider_checkout_id: PAYMENT.checkoutConfigurationId,
            status: "checkout_created",
          }],
        };
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
      customUserId: "user_SpoofedAttacker123",
      checkoutIntentId: "22222222-2222-4222-8222-222222222222",
    }),
  );
  assert.deepEqual(result, { duplicate: false, applied: true });
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE billing_checkout_sessions")),
    true,
  );
});

test("an adverse payment uses verified webhook time when provider timestamps are absent", async () => {
  let paymentHistoryParameters;
  const existingMembership = {
    clerk_user_id: "user_CheckoutTester123",
    provider_member_id: MEMBERSHIP.memberId,
    provider_user_id: MEMBERSHIP.userId,
    company_id: PAYMENT.companyId,
    product_id: PAYMENT.productId,
    plan_id: PAYMENT.planId,
    checkout_configuration_id: PAYMENT.checkoutConfigurationId,
    state_changed_at: new Date("2026-07-27T00:00:00.000Z"),
    period_started_at: new Date("2026-07-27T00:00:00.000Z"),
  };
  const store = createPostgresBillingStore({
    pool: scriptedPool((sql, parameters) => {
      if (sql.startsWith("SELECT clerk_user_id, provider_member_id")) {
        return { rows: [existingMembership] };
      }
      if (sql.startsWith("INSERT INTO billing_provider_events")) {
        return { rows: [{ payload_digest: "a".repeat(64) }] };
      }
      if (sql.startsWith("UPDATE billing_memberships")) {
        return { rows: [{ clerk_user_id: existingMembership.clerk_user_id }] };
      }
      if (sql.startsWith("INSERT INTO billing_payment_history")) {
        paymentHistoryParameters = parameters;
        return {
          rowCount: 1,
          rows: [{ clerk_user_id: existingMembership.clerk_user_id }],
        };
      }
      return { rows: [] };
    }),
    providerMode: "test",
  });
  const input = paymentStateInput({
    payment: {
      ...PAYMENT,
      createdAt: null,
      updatedAt: null,
    },
  });

  assert.deepEqual(
    await store.applyPaymentStateWebhook(input),
    { duplicate: false, applied: true },
  );
  assert.equal(
    paymentHistoryParameters[18],
    input.eventTimestamp,
    "verified webhook time must replace an absent provider payment timestamp",
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

function membershipInput(overrides = {}) {
  return {
    deliveryId: "msg_membership123456",
    eventName: "membership.activated",
    eventTimestamp: new Date("2026-07-27T00:00:01.000Z"),
    payloadDigest: "b".repeat(64),
    sanitizedPayload: { resourceId: MEMBERSHIP.id },
    membership: MEMBERSHIP,
    customUserId: "",
    checkoutIntentId: "",
    ...overrides,
  };
}

function checkoutRow() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clerk_user_id: "user_CheckoutTester123",
    requested_plan: "plus",
    company_id: PAYMENT.companyId,
    product_id: PAYMENT.productId,
    plan_id: PAYMENT.planId,
    provider_checkout_id: PAYMENT.checkoutConfigurationId,
    status: "checkout_created",
  };
}

function checkoutTombstoneRow(overrides = {}) {
  return {
    provider_checkout_id: PAYMENT.checkoutConfigurationId,
    prior_membership_ids: [],
    provider_membership_id: null,
    company_id: PAYMENT.companyId,
    product_id: PAYMENT.productId,
    plan_id: PAYMENT.planId,
    plan_code: PAYMENT.planCode,
    termination_state: "pending",
    provider_updated_at: null,
    ...overrides,
  };
}

function archivedPaymentRow() {
  return {
    record_id: "33333333-3333-4333-8333-333333333333",
    record_category: "payment_supply",
    subject_lookup_hmac: "a".repeat(64),
    former_account_hmac: "b".repeat(64),
    hmac_key_version: 1,
    company_id: PAYMENT.companyId,
    provider_checkout_id: PAYMENT.checkoutConfigurationId,
    provider_membership_id: PAYMENT.membershipId,
    provider_payment_id: PAYMENT.id,
    product_id: PAYMENT.productId,
    plan_id: PAYMENT.planId,
    plan_code: PAYMENT.planCode,
    settlement_amount: PAYMENT.settlementAmount,
    currency: PAYMENT.currency,
    tax_amount: PAYMENT.taxAmount,
    tax_behavior: PAYMENT.taxBehavior,
    billing_reason: PAYMENT.billingReason,
    status: "succeeded",
    contracted_at: new Date("2026-07-27T00:00:00.000Z"),
    paid_at: PAYMENT.paidAt,
    canceled_at: null,
    refunded_at: null,
    disputed_at: null,
    provider_updated_at: PAYMENT.createdAt,
  };
}

function deletionBlockedError(error) {
  return error.status === 403 && error.code === "ACCOUNT_DELETION_IN_PROGRESS";
}

function scriptedPool(runQuery, { deletionBlocked = false } = {}) {
  const client = {
    async query(text, parameters) {
      const sql = String(text).replace(/\s+/g, " ").trim();
      if (sql.startsWith("SELECT NOT EXISTS")) {
        return { rows: [{ allowed: !deletionBlocked }] };
      }
      return runQuery(sql, parameters);
    },
    release() {},
  };
  return {
    async connect() { return client; },
    async query(text, parameters) { return client.query(text, parameters); },
  };
}
