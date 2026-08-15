import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPostgresPrivacyStore } from "../src/privacy-store.js";

const USER_ID = "user_PrivacyStore123";
const HMAC_KEY = Buffer.alloc(32, 7).toString("base64url");
const NOW = new Date("2026-08-15T00:00:00.000Z");

test("payment archive trigger advances dispute retention from latest evidence", async () => {
  const migration = normalizeSql(await readFile(
    new URL("../migrations/006_privacy_compliance.sql", import.meta.url),
    "utf8",
  ));

  assert.match(
    migration,
    /dispute_evidence_at := CASE WHEN dispute_at IS NULL THEN NULL ELSE GREATEST\( dispute_at, COALESCE\(NEW\.provider_updated_at, dispute_at\) \) END/,
  );
  assert.match(
    migration,
    /'complaint_dispute'::text, dispute_evidence_at/,
  );
  assert.match(
    migration,
    /retention_expires_at = GREATEST\( legal_retention\.transaction_records\.retention_expires_at, EXCLUDED\.retention_expires_at \)/,
  );
});

test("archive triggers fail closed on ownership conflicts but allow a verified newer record", async () => {
  const migration = normalizeSql(await readFile(
    new URL("../migrations/006_privacy_compliance.sql", import.meta.url),
    "utf8",
  ));

  assert.equal(
    migration.match(/MESSAGE = 'PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT'/g)?.length,
    2,
  );
  assert.match(
    migration,
    /archive\.record_category = 'contract_withdrawal'.*archive\.former_account_hmac = identity\.former_account_hmac.*archive\.company_id IS NOT DISTINCT FROM NEW\.company_id.*archive\.retention_expires_at >=/,
  );
  assert.match(
    migration,
    /archive\.record_category = category.*archive\.provider_payment_id = NEW\.provider_payment_id.*archive\.former_account_hmac = identity\.former_account_hmac.*archive\.company_id IS NOT DISTINCT FROM NEW\.company_id.*archive\.retention_expires_at >=/,
  );
});

test("deletion-time archival uses the prepared subject identity without rewriting it", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    if (sql.startsWith("SELECT subject_lookup_hmac")) {
      return {
        rows: [{
          subject_lookup_hmac: "a".repeat(64),
          former_account_hmac: "b".repeat(64),
          hmac_key_version: 1,
        }],
      };
    }
    if (sql.startsWith("SELECT provider_mode, provider_membership_id")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("SELECT provider_mode, provider_payment_id")) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  const result = await store.archiveUserTransactions({
    userId: USER_ID,
    email: "privacy@example.com",
    useStoredIdentity: true,
  });

  assert.deepEqual(result, { memberships: 0, payments: 0 });
  assert.equal(
    queries.some((sql) => sql.startsWith("INSERT INTO privacy_subject_index")),
    false,
  );
  assert.equal(queries.includes("BEGIN"), true);
  assert.equal(queries.includes("COMMIT"), true);
});

test("dispute archival retains the opening date but expires from latest handling", async () => {
  const openedAt = new Date("2026-01-10T00:00:00.000Z");
  const resolvedAt = new Date("2026-02-20T00:00:00.000Z");
  const archiveParameters = [];
  const pool = scriptedPool((sql, parameters) => {
    if (sql.startsWith("SELECT subject_lookup_hmac")) {
      return {
        rows: [{
          subject_lookup_hmac: "a".repeat(64),
          former_account_hmac: "b".repeat(64),
          hmac_key_version: 1,
        }],
        rowCount: 1,
      };
    }
    if (sql.startsWith("SELECT provider_mode, provider_membership_id")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("SELECT provider_mode, provider_payment_id")) {
      return {
        rows: [{
          provider_mode: "live",
          provider_payment_id: "pay_PrivacyDispute123",
          provider_membership_id: "mem_PrivacyDispute123",
          provider_checkout_id: "ch_PrivacyDispute123",
          company_id: "biz_PrivacyDispute123",
          product_id: "prod_PrivacyDispute123",
          plan_id: "plan_PrivacyDispute123",
          plan_code: "plus",
          display_status: "paid",
          provider_substatus: "dispute_won",
          settlement_amount: 5,
          currency: "usd",
          tax_amount: 0,
          tax_behavior: "exclusive",
          billing_reason: "subscription_create",
          paid_at: new Date("2026-01-01T00:00:00.000Z"),
          provider_created_at: new Date("2026-01-01T00:00:00.000Z"),
          provider_updated_at: resolvedAt,
          refunded_at: null,
          disputed_at: openedAt,
        }],
        rowCount: 1,
      };
    }
    if (sql.startsWith("INSERT INTO legal_retention.transaction_records")) {
      archiveParameters.push(parameters);
      return { rows: [{ record_id: parameters[0] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  assert.deepEqual(
    await store.archiveUserTransactions({
      userId: USER_ID,
      email: "privacy@example.com",
      useStoredIdentity: true,
    }),
    { memberships: 0, payments: 1 },
  );

  const dispute = archiveParameters.find((parameters) =>
    parameters[1] === "complaint_dispute");
  assert.ok(dispute);
  assert.equal(dispute[19], resolvedAt);
  assert.equal(dispute[22], openedAt);
  assert.equal(
    dispute[24].toISOString(),
    "2029-02-20T00:00:00.000Z",
  );
});

test("deletion identity preparation is queue-bound and uses only a transaction-local bypass", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    if (sql.startsWith("SELECT 1 FROM privacy_deletion_queue")) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const store = privacyStore(pool);

  await store.prepareDeletionIdentity({
    requestId: "11111111-1111-4111-8111-111111111111",
    userId: USER_ID,
    email: " Privacy@Example.com ",
  });

  assert.ok(
    queries.some((sql) =>
      sql.startsWith("SELECT set_config('zenaian.privacy_deletion_worker'")),
  );
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO privacy_subject_index")));
  assert.ok(queries.some((sql) => sql.startsWith("UPDATE privacy_deletion_queue")));
  assert.equal(queries.includes("COMMIT"), true);
});

test("operational deletion is idempotent and respects foreign-key-safe order", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    if (sql.startsWith("SELECT ARRAY(SELECT provider_membership_id")) {
      return {
        rows: [{ membership_ids: [], payment_ids: [], checkout_ids: [] }],
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  await store.deleteOperationalRows(USER_ID);
  await store.deleteOperationalRows(USER_ID);

  const firstPass = queries.slice(0, queries.indexOf("COMMIT") + 1);
  assert.ok(
    indexOfSql(firstPass, "DELETE FROM billing_analysis_usage") <
      indexOfSql(firstPass, "DELETE FROM billing_usage_periods"),
  );
  assert.ok(
    indexOfSql(firstPass, "DELETE FROM billing_payment_history") <
      indexOfSql(firstPass, "DELETE FROM billing_memberships"),
  );
  assert.ok(
    indexOfSql(firstPass, "WITH raw_candidates AS") <
      indexOfSql(firstPass, "DELETE FROM billing_checkout_sessions"),
  );
  assert.ok(
    indexOfSql(firstPass, "DELETE FROM extension_pairing_grants") <
      indexOfSql(firstPass, "DELETE FROM privacy_subject_index"),
  );
  assert.equal(queries.filter((sql) => sql === "COMMIT").length, 2);
  assert.equal(queries.includes("ROLLBACK"), false);
});

test("deletion tombstones every checkout known from live and archived evidence", async () => {
  let tombstoneSql = "";
  const pool = scriptedPool((sql) => {
    if (sql.startsWith("WITH raw_candidates AS")) {
      tombstoneSql = sql;
      return { rows: [{ expected: "1", stored: "1" }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT ARRAY(SELECT provider_membership_id")) {
      return {
        rows: [{ membership_ids: [], payment_ids: [], checkout_ids: [] }],
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  await store.deleteOperationalRows(USER_ID);
  assert.match(tombstoneSql, /FROM billing_checkout_sessions AS checkout/);
  assert.match(tombstoneSql, /FROM billing_memberships AS membership/);
  assert.match(tombstoneSql, /FROM billing_payment_history AS payment/);
  assert.match(tombstoneSql, /FROM legal_retention\.transaction_records AS archive/);
  assert.match(tombstoneSql, /archive\.former_account_hmac = ANY\(\$2::text\[\]\)/);
  assert.match(tombstoneSql, /prior_membership_ids/);
  assert.doesNotMatch(tombstoneSql, /NOT EXISTS \( SELECT 1 FROM billing_memberships/);
  assert.doesNotMatch(tombstoneSql, /checkout\.status|expires_at|400 days/);
  const insertedColumns = tombstoneSql.slice(
    tombstoneSql.indexOf("INSERT INTO billing_checkout_tombstones"),
    tombstoneSql.indexOf("SELECT provider_mode, provider_checkout_id"),
  );
  assert.doesNotMatch(insertedColumns, /clerk_user_id|email/i);
});

test("deletion fails closed if an issued checkout cannot be tombstoned", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    if (sql.startsWith("WITH raw_candidates AS")) {
      return { rows: [{ expected: "1", stored: "0" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  await assert.rejects(
    store.deleteOperationalRows(USER_ID),
    (error) =>
      error.status === 409 &&
      error.code === "PRIVACY_CHECKOUT_TOMBSTONE_CONFLICT",
  );
  assert.equal(queries.some((sql) => sql.startsWith("DELETE FROM billing_")), false);
});

test("provider cancellation retries retain only provider mode and membership ID", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    if (sql.startsWith("SELECT 1 FROM privacy_deletion_queue")) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT provider_mode, provider_membership_id")) {
      return {
        rows: [{
          provider_mode: "live",
          provider_membership_id: "mem_PrivacyMembership123",
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  const store = privacyStore(pool);

  const retries = await store.prepareDeletionMembershipRetries({
    requestId: "11111111-1111-4111-8111-111111111111",
    userId: USER_ID,
  });

  assert.deepEqual(retries, [{
    mode: "live",
    id: "mem_PrivacyMembership123",
  }]);
  const inserted = queries.find((sql) =>
    sql.startsWith("INSERT INTO privacy_deletion_membership_retries"));
  assert.ok(inserted);
  assert.doesNotMatch(inserted, /email|checkout_url|clerk_user_id\s*,/i);
});

test("checkout expiry also closes crash-created rows without a URL", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    return { rows: [], rowCount: 2 };
  });
  const store = privacyStore(pool);

  assert.equal(await store.expireCheckoutSessions(NOW, 500), 2);
  const query = queries.find((sql) => sql.startsWith("WITH selected AS"));
  assert.ok(query);
  assert.match(query, /status IN \('pending', 'checkout_created'\) AND expires_at <= \$1/);
  assert.doesNotMatch(query, /checkout_url IS NOT NULL AND \(expires_at/);
});

test("retention purge locks every candidate and rechecks mutable eligibility", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  await store.purgeRetention(NOW, 37);

  const purges = queries.filter((sql) => sql.startsWith("WITH doomed AS"));
  assert.equal(purges.length, 8);
  for (const query of purges) {
    assert.match(
      query,
      /FOR UPDATE(?: OF [a-z]+)? SKIP LOCKED/,
      `candidate selector is not concurrency-safe: ${query}`,
    );
  }

  const analysisUsage = purges.find((sql) =>
    sql.includes('DELETE FROM "billing_analysis_usage"'));
  assert.match(analysisUsage, /target\.state IN \('consumed', 'released'\)/);
  assert.match(analysisUsage, /target\.settled_at < \$1 - interval '30 days'/);

  const usagePeriods = purges.find((sql) =>
    sql.includes('DELETE FROM "billing_usage_periods"'));
  assert.match(usagePeriods, /target\.ends_at < \$1 - interval '90 days'/);
  assert.match(
    usagePeriods,
    /usage\.usage_period_id = target\.id/,
  );

  const checkouts = purges.find((sql) =>
    sql.includes('DELETE FROM "billing_checkout_sessions"'));
  assert.match(checkouts, /target\.status IN \('failed', 'expired'\)/);
  assert.match(checkouts, /COALESCE\(target\.consumed_at, target\.updated_at\)/);

  const providerEvents = purges.find((sql) =>
    sql.includes("DELETE FROM billing_provider_events"));
  assert.match(providerEvents, /event\.received_at < \$1 - interval '30 days'/);

  const payments = purges.find((sql) =>
    sql.includes("DELETE FROM billing_payment_history"));
  assert.match(payments, /payment\.archived_at IS NOT NULL/);
  assert.match(
    payments,
    /payment\.provider_updated_at < \$1 - interval '12 months'/,
  );
  assert.match(payments, /archive\.record_category = 'payment_supply'/g);
  assert.match(
    payments,
    /archive\.provider_payment_id = (?:candidate|payment)\.provider_payment_id/g,
  );
  assert.match(payments, /identity\.former_account_hmac =\s+archive\.former_account_hmac/g);
  assert.match(payments, /archive\.company_id IS NOT DISTINCT FROM (?:candidate|payment)\.company_id/g);
  assert.match(payments, /archive\.product_id IS NOT DISTINCT FROM (?:candidate|payment)\.product_id/g);
  assert.match(payments, /archive\.plan_id IS NOT DISTINCT FROM (?:candidate|payment)\.plan_id/g);
  assert.match(payments, /archive\.plan_code IS NOT DISTINCT FROM (?:candidate|payment)\.plan_code/g);

  const memberships = purges.find((sql) =>
    sql.includes("DELETE FROM billing_memberships"));
  assert.match(memberships, /membership\.access_state IN \('inactive', 'revoked'\)/g);
  assert.match(
    memberships,
    /archive\.provider_membership_id = membership\.provider_membership_id/g,
  );
  assert.match(memberships, /archive\.record_category = 'contract_withdrawal'/g);
  assert.match(memberships, /identity\.former_account_hmac =\s+archive\.former_account_hmac/g);
  assert.match(memberships, /archive\.company_id IS NOT DISTINCT FROM membership\.company_id/g);
  assert.match(memberships, /archive\.product_id IS NOT DISTINCT FROM membership\.product_id/g);
  assert.match(memberships, /archive\.plan_id IS NOT DISTINCT FROM membership\.plan_id/g);
  assert.match(memberships, /archive\.plan_code IS NOT DISTINCT FROM membership\.plan_code/g);

  const legalArchive = purges.find((sql) =>
    sql.includes('DELETE FROM "legal_retention"\."transaction_records"'));
  assert.match(legalArchive, /target\.retention_expires_at <= \$1/);

  const audits = purges.find((sql) =>
    sql.includes("DELETE FROM privacy_request_audit"));
  assert.match(audits, /audit\.purge_after <= \$1/g);
  assert.match(audits, /queue\.request_id = audit\.request_id/g);
});

test("privacy export queries omit extension credentials and checkout URLs", async () => {
  const queries = [];
  const pool = scriptedPool((sql) => {
    queries.push(sql);
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  const exported = await store.exportRows({
    userId: USER_ID,
    email: "privacy@example.com",
  });

  assert.deepEqual(exported.extensionDeviceSessions, []);
  assert.deepEqual(exported.extensionPairings, []);
  const selectText = queries
    .filter((sql) => sql.startsWith("SELECT"))
    .join("\n");
  assert.doesNotMatch(selectText, /\bcode_hash\b/i);
  assert.doesNotMatch(selectText, /\bnonce_hash\b/i);
  assert.doesNotMatch(selectText, /\btoken_version\b/i);
  assert.doesNotMatch(selectText, /\bcheckout_url\b/i);
});

test("privacy exports have a persistent per-account cooldown", async () => {
  const receivedAt = new Date(NOW.getTime() - 60_000);
  const pool = scriptedPool((sql) => {
    if (sql.startsWith("SELECT received_at FROM privacy_request_audit")) {
      return { rows: [{ received_at: receivedAt }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const store = privacyStore(pool);

  await assert.rejects(
    store.beginExport(USER_ID, NOW),
    (error) =>
      error.status === 429 &&
      error.code === "PRIVACY_EXPORT_RATE_LIMITED" &&
      error.retryAfterSeconds === 240,
  );
});

function privacyStore(pool) {
  return createPostgresPrivacyStore({
    pool,
    hmacKey: HMAC_KEY,
    hmacKeyVersion: 1,
    providerMode: "live",
  });
}

function scriptedPool(runQuery) {
  const client = {
    async query(text, parameters) {
      return runQuery(normalizeSql(text), parameters);
    },
    release() {},
  };
  return {
    async connect() {
      return client;
    },
    async query(text, parameters) {
      return client.query(text, parameters);
    },
  };
}

function normalizeSql(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function indexOfSql(queries, prefix) {
  const index = queries.findIndex((sql) => sql.startsWith(prefix));
  assert.notEqual(index, -1, `Expected SQL beginning with: ${prefix}`);
  return index;
}
