import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { createPostgresPrivacyStore } from "../src/privacy-store.js";
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
      "002_extension_device_sessions.sql",
      "003_whop_billing_foundation.sql",
      "004_whop_production_lifecycle.sql",
      "005_single_plan_and_payment_history.sql",
      "006_privacy_compliance.sql",
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
      await verifyCheckoutAndMembershipMapping(store, scopedUrl.href);
      await verifyDeletedCheckoutTombstone(store, scopedUrl.href);
      await verifyRetentionPurgeSkipsConcurrentUpdate(scopedUrl.href);
      await verifyDisputeRetentionUsesLatestEvidence(scopedUrl.href);
      await verifyArchiveOwnershipConflictFailsClosed(scopedUrl.href);
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

async function verifyCheckoutAndMembershipMapping(store, connectionString) {
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
      settlementAmount: 5,
      currency: "usd",
      taxAmount: 0.45,
      taxBehavior: "exclusive",
      billingReason: "subscription_create",
      paidAt: new Date("2026-07-27T00:00:02.000Z"),
      createdAt: new Date("2026-07-27T00:00:02.000Z"),
      updatedAt: new Date("2026-07-27T00:00:02.000Z"),
      refundedAt: null,
      disputedAt: null,
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
  const verifier = new Pool({ connectionString, max: 1 });
  let paymentEvidence;
  try {
    paymentEvidence = await verifier.query(
      `SELECT provider_checkout_id, company_id, product_id, plan_id,
              settlement_amount, currency, tax_amount, tax_behavior,
              billing_reason
       FROM billing_payment_history
       WHERE provider_mode = 'test' AND provider_payment_id = $1`,
      [input.payment.id],
    );
  } finally {
    await verifier.end();
  }
  assert.equal(paymentEvidence.rows[0].provider_checkout_id, "ch_checkout123456");
  assert.equal(paymentEvidence.rows[0].company_id, membership.companyId);
  assert.equal(Number(paymentEvidence.rows[0].settlement_amount), 5);
  assert.equal(paymentEvidence.rows[0].currency, "usd");
  assert.equal(Number(paymentEvidence.rows[0].tax_amount), 0.45);

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

  const refundedPayment = {
    ...input.payment,
    substatus: "refunded",
    displayStatus: "refunded",
    updatedAt: new Date("2026-07-27T00:00:05.000Z"),
    refundedAt: new Date("2026-07-27T00:00:05.000Z"),
  };
  const refunded = await store.applyPaymentStateWebhook({
    deliveryId: "msg_refunded123456",
    eventName: "refund.created",
    eventTimestamp: new Date("2026-07-27T00:00:06.000Z"),
    payloadDigest: "d".repeat(64),
    sanitizedPayload: { resourceId: refundedPayment.id },
    payment: refundedPayment,
    // Provider checkout mapping is authoritative. These valid-looking but
    // incorrect legacy metadata hints must not change account ownership.
    customUserId: "user_SpoofedAttacker123",
    checkoutIntentId: "22222222-2222-4222-8222-222222222222",
    accessState: "revoked",
  });
  assert.equal(refunded.applied, true);

  const staleReplayInput = {
    deliveryId: "reconcile_refunded123456",
    eventName: "reconciliation.payment_revoked",
    eventTimestamp: new Date("2026-07-27T00:00:05.000Z"),
    payloadDigest: "e".repeat(64),
    sanitizedPayload: { resourceId: refundedPayment.id },
    payment: refundedPayment,
    customUserId: "",
    checkoutIntentId: "",
    accessState: "revoked",
  };
  assert.deepEqual(
    await store.applyPaymentStateWebhook(staleReplayInput),
    { duplicate: false, applied: false, stale: true },
  );
  assert.deepEqual(
    await store.applyPaymentStateWebhook(staleReplayInput),
    { duplicate: true, applied: false },
  );
  mapped = await store.listSubscriptions(userId);
  assert.equal(mapped[0].status, "revoked");
  const refundedHistory = await store.listPaymentHistory(userId);
  assert.equal(refundedHistory[0].status, "refunded");

  const orphanedPayment = {
    ...refundedPayment,
    id: "pay_orphaned123456",
    membershipId: "mem_missing123456",
  };
  const orphaned = await store.applyPaymentStateWebhook({
    deliveryId: "reconcile_orphaned123456",
    eventName: "reconciliation.payment_revoked",
    eventTimestamp: new Date("2026-07-27T00:00:07.000Z"),
    payloadDigest: "f".repeat(64),
    sanitizedPayload: { resourceId: orphanedPayment.id },
    payment: orphanedPayment,
    customUserId: "",
    checkoutIntentId: "",
    accessState: "revoked",
  });
  assert.deepEqual(
    orphaned,
    { duplicate: false, applied: false, quarantined: true },
  );
}

async function verifyDeletedCheckoutTombstone(store, connectionString) {
  const checkoutConfigurationId = "ch_deletedcheckout123456";
  const membership = normalizedMembership({
    id: "mem_deletedmembership123456",
    checkoutConfigurationId,
    updatedAt: new Date("2026-07-27T00:00:10.000Z"),
  });
  const verifier = new Pool({ connectionString, max: 1 });
  try {
    await verifier.query(
      `INSERT INTO billing_checkout_tombstones (
         provider_mode, provider_checkout_id, company_id, product_id,
         plan_id, plan_code
       ) VALUES ('test', $1, $2, $3, $4, $5)`,
      [
        checkoutConfigurationId,
        membership.companyId,
        membership.productId,
        membership.planId,
        membership.planCode,
      ],
    );
  } finally {
    await verifier.end();
  }

  const result = await store.applyMembershipWebhook({
    deliveryId: "msg_deletedcheckout123456",
    eventName: "membership.activated",
    eventTimestamp: membership.updatedAt,
    payloadDigest: "9".repeat(64),
    sanitizedPayload: { resourceId: membership.id },
    membership,
    customUserId: "",
    checkoutIntentId: "",
  });
  assert.deepEqual(result, {
    duplicate: false,
    applied: false,
    quarantined: true,
    tombstoned: true,
    terminationRequired: true,
  });
  assert.deepEqual(
    await store.listPendingCheckoutTombstones(),
    [{
      checkoutConfigurationId,
      membershipId: membership.id,
      companyId: membership.companyId,
      productId: membership.productId,
      planId: membership.planId,
      planCode: membership.planCode,
      updatedAt: membership.updatedAt,
    }],
  );
  await store.confirmCheckoutTombstoneTermination({
    ...membership,
    providerStatus: "canceled",
    accessState: "inactive",
    updatedAt: new Date("2026-07-27T00:00:11.000Z"),
  });
  assert.deepEqual(await store.listPendingCheckoutTombstones(), []);
}

async function verifyRetentionPurgeSkipsConcurrentUpdate(connectionString) {
  const paymentId = "pay_purgeConcurrency123456";
  const verifier = new Pool({ connectionString, max: 2 });
  const privacyStore = createPostgresPrivacyStore({
    connectionString,
    poolMax: 2,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 1_000,
    hmacKey: randomBytes(32).toString("base64url"),
    hmacKeyVersion: 1,
    providerMode: "test",
  });
  const updater = await verifier.connect();
  try {
    await privacyStore.initialize();
    await verifier.query(
      `INSERT INTO billing_payment_history (
         provider_mode, provider_payment_id, clerk_user_id, plan_code,
         display_status, provider_substatus, provider_updated_at, archived_at
       ) VALUES (
         'test', $1, 'user_PurgeConcurrency123', 'plus',
         'paid', 'succeeded', '2020-01-01T00:00:00Z',
         '2020-01-01T00:00:00Z'
       )`,
      [paymentId],
    );

    await updater.query("BEGIN");
    await updater.query(
      `UPDATE billing_payment_history
       SET provider_updated_at = '2035-01-01T00:00:00Z'
       WHERE provider_mode = 'test' AND provider_payment_id = $1`,
      [paymentId],
    );

    const counts = await privacyStore.purgeRetention(
      new Date("2030-01-01T00:00:00.000Z"),
      500,
    );
    assert.equal(
      counts.paymentHistory,
      0,
      "a webhook-locked payment must be skipped by retention purge",
    );
    await updater.query("COMMIT");

    const retained = await verifier.query(
      `SELECT provider_updated_at
       FROM billing_payment_history
       WHERE provider_mode = 'test' AND provider_payment_id = $1`,
      [paymentId],
    );
    assert.equal(retained.rowCount, 1);
    assert.equal(
      new Date(retained.rows[0].provider_updated_at).toISOString(),
      "2035-01-01T00:00:00.000Z",
    );
  } catch (error) {
    await updater.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    updater.release();
    await privacyStore.close();
    await verifier.end();
  }
}

async function verifyDisputeRetentionUsesLatestEvidence(connectionString) {
  const verifier = new Pool({ connectionString, max: 1 });
  const userId = "user_DisputeRetention123";
  const paymentId = "pay_disputeRetention123456";
  const openedAt = new Date("2027-01-10T00:00:00.000Z");
  const resolvedAt = new Date("2027-03-20T00:00:00.000Z");
  try {
    await verifier.query(
      `INSERT INTO privacy_subject_index (
         clerk_user_id, subject_lookup_hmac, former_account_hmac,
         hmac_key_version
       ) VALUES ($1, $2, $3, 1)`,
      [userId, "c".repeat(64), "d".repeat(64)],
    );
    await verifier.query(
      `INSERT INTO billing_payment_history (
         provider_mode, provider_payment_id, clerk_user_id, plan_code,
         display_status, provider_substatus, provider_updated_at, disputed_at
       ) VALUES (
         'test', $1, $2, 'plus', 'disputed', 'dispute_opened', $3, $3
       )`,
      [paymentId, userId, openedAt],
    );

    let archive = await verifier.query(
      `SELECT disputed_at, provider_updated_at, retention_expires_at
       FROM legal_retention.transaction_records
       WHERE provider = 'whop' AND provider_mode = 'test'
         AND record_category = 'complaint_dispute'
         AND provider_payment_id = $1`,
      [paymentId],
    );
    assert.equal(archive.rowCount, 1);
    assert.equal(
      new Date(archive.rows[0].retention_expires_at).toISOString(),
      "2030-01-10T00:00:00.000Z",
    );

    await verifier.query(
      `UPDATE billing_payment_history
       SET display_status = 'paid', provider_substatus = 'dispute_won',
           provider_updated_at = $2
       WHERE provider_mode = 'test' AND provider_payment_id = $1`,
      [paymentId, resolvedAt],
    );
    archive = await verifier.query(
      `SELECT disputed_at, provider_updated_at, retention_expires_at
       FROM legal_retention.transaction_records
       WHERE provider = 'whop' AND provider_mode = 'test'
         AND record_category = 'complaint_dispute'
         AND provider_payment_id = $1`,
      [paymentId],
    );
    assert.equal(
      new Date(archive.rows[0].disputed_at).toISOString(),
      openedAt.toISOString(),
      "the first dispute date remains available as historical evidence",
    );
    assert.equal(
      new Date(archive.rows[0].provider_updated_at).toISOString(),
      resolvedAt.toISOString(),
    );
    assert.equal(
      new Date(archive.rows[0].retention_expires_at).toISOString(),
      "2030-03-20T00:00:00.000Z",
    );

    await verifier.query(
      `UPDATE billing_payment_history
       SET provider_updated_at = '2027-02-01T00:00:00Z'
       WHERE provider_mode = 'test' AND provider_payment_id = $1`,
      [paymentId],
    );
    archive = await verifier.query(
      `SELECT provider_updated_at, retention_expires_at
       FROM legal_retention.transaction_records
       WHERE provider = 'whop' AND provider_mode = 'test'
         AND record_category = 'complaint_dispute'
         AND provider_payment_id = $1`,
      [paymentId],
    );
    assert.equal(
      new Date(archive.rows[0].provider_updated_at).toISOString(),
      resolvedAt.toISOString(),
    );
    assert.equal(
      new Date(archive.rows[0].retention_expires_at).toISOString(),
      "2030-03-20T00:00:00.000Z",
      "stale evidence must not shorten the statutory period",
    );
  } finally {
    await verifier.end();
  }
}

async function verifyArchiveOwnershipConflictFailsClosed(connectionString) {
  const verifier = new Pool({ connectionString, max: 1 });
  const conflictUserId = "user_ArchiveConflict123";
  const conflictPaymentId = "pay_archiveConflict123456";
  const staleUserId = "user_ArchiveStaleSafe123";
  const stalePaymentId = "pay_archiveStaleSafe123456";
  const companyId = "biz_745hMbzbWHtrZr";
  const productId = "prod_M3Wts8bsfX4mK";
  const planId = "plan_QzpD3pxTswPLX";
  try {
    await verifier.query(
      `INSERT INTO privacy_subject_index (
         clerk_user_id, subject_lookup_hmac, former_account_hmac,
         hmac_key_version
       ) VALUES
         ($1, $2, $3, 1),
         ($4, $5, $6, 1)`,
      [
        conflictUserId, "1".repeat(64), "2".repeat(64),
        staleUserId, "3".repeat(64), "4".repeat(64),
      ],
    );
    await verifier.query(
      `INSERT INTO legal_retention.transaction_records (
         record_id, record_category, subject_lookup_hmac,
         former_account_hmac, hmac_key_version, provider, provider_mode,
         company_id, provider_payment_id, product_id, plan_id, plan_code,
         status, provider_updated_at, paid_at, retention_basis,
         retention_expires_at
       ) VALUES
         ($1, 'payment_supply', $2, $3, 1, 'whop', 'test',
          'biz_conflictingOwner123', $4, 'prod_conflictingOwner123',
          'plan_conflictingOwner123', 'plus', 'succeeded',
          '2031-01-01T00:00:00Z', '2031-01-01T00:00:00Z',
          'test statutory record', '2036-01-01T00:00:00Z'),
         ($5, 'payment_supply', $6, $7, 1, 'whop', 'test',
          $8, $9, $10, $11, 'plus', 'succeeded',
          '2031-01-01T00:00:00Z', '2030-01-01T00:00:00Z',
          'test statutory record', '2036-01-01T00:00:00Z')`,
      [
        randomUUID(), "9".repeat(64), "8".repeat(64), conflictPaymentId,
        randomUUID(), "3".repeat(64), "4".repeat(64), companyId,
        stalePaymentId, productId, planId,
      ],
    );

    await assert.rejects(
      verifier.query(
        `INSERT INTO billing_payment_history (
           provider_mode, provider_payment_id, clerk_user_id, plan_code,
           display_status, provider_substatus, provider_updated_at,
           company_id, product_id, plan_id, paid_at
         ) VALUES (
           'test', $1, $2, 'plus', 'paid', 'succeeded',
           '2030-01-01T00:00:00Z', $3, $4, $5,
           '2030-01-01T00:00:00Z'
         )`,
        [conflictPaymentId, conflictUserId, companyId, productId, planId],
      ),
      (error) =>
        error.code === "P0001" &&
        String(error.message).includes("PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT"),
    );
    assert.equal(
      Number((await verifier.query(
        `SELECT count(*) AS count FROM billing_payment_history
         WHERE provider_mode = 'test' AND provider_payment_id = $1`,
        [conflictPaymentId],
      )).rows[0].count),
      0,
      "the operational row must roll back when archive ownership conflicts",
    );

    await verifier.query(
      `INSERT INTO billing_payment_history (
         provider_mode, provider_payment_id, clerk_user_id, plan_code,
         display_status, provider_substatus, provider_updated_at,
         company_id, product_id, plan_id, paid_at
       ) VALUES (
         'test', $1, $2, 'plus', 'paid', 'succeeded',
         '2030-01-01T00:00:00Z', $3, $4, $5,
         '2030-01-01T00:00:00Z'
       )`,
      [stalePaymentId, staleUserId, companyId, productId, planId],
    );
    assert.equal(
      Number((await verifier.query(
        `SELECT count(*) AS count FROM billing_payment_history
         WHERE provider_mode = 'test' AND provider_payment_id = $1
           AND archived_at IS NOT NULL`,
        [stalePaymentId],
      )).rows[0].count),
      1,
      "a verified newer same-owner archive must make stale replay safe",
    );
  } finally {
    await verifier.query(
      `DELETE FROM legal_retention.transaction_records
       WHERE provider = 'whop' AND provider_mode = 'test'
         AND provider_payment_id = ANY($1::text[])`,
      [[conflictPaymentId, stalePaymentId]],
    ).catch(() => {});
    await verifier.end();
  }
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
