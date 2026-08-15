import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_DELETION_STATES = Object.freeze(["blocked", "partial", "complete"]);

export function createPostgresPrivacyStore({
  connectionString,
  pool,
  poolMax = 4,
  connectionTimeoutMs = 5000,
  statementTimeoutMs = 10000,
  hmacKey,
  hmacKeyVersion,
  previousHmacKeys = [],
  providerMode,
  randomUUIDFn = randomUUID,
}) {
  if (!pool && !connectionString) {
    throw new Error("DATABASE_URL is required for privacy operations.");
  }
  if (!new Set(["test", "live"]).has(providerMode)) {
    throw new Error("Privacy storage requires Whop test or live mode.");
  }
  const hmacKeyBytes = decodeHmacKey(hmacKey);
  if (!Number.isInteger(hmacKeyVersion) || hmacKeyVersion < 1) {
    throw new Error("PRIVACY_ARCHIVE_HMAC_KEY_VERSION must be a positive integer.");
  }
  const keyring = [
    { version: hmacKeyVersion, key: hmacKeyBytes },
    ...previousHmacKeys.map((entry) => ({
      version: entry.version,
      key: decodeHmacKey(entry.key),
    })),
  ];
  if (
    keyring.some((entry) => !Number.isInteger(entry.version) || entry.version < 1) ||
    new Set(keyring.map((entry) => entry.version)).size !== keyring.length
  ) {
    throw new Error("Privacy HMAC key versions must be unique positive integers.");
  }

  const database = pool || new Pool({
    connectionString,
    max: Math.max(1, Math.min(10, poolMax)),
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
    application_name: "zenaian-privacy",
  });
  const ownsPool = !pool;
  // Session advisory locks must not consume a connection from the pool used
  // by the callback. Otherwise a pool of one deadlocks, and enough concurrent
  // privacy requests can starve every callback behind its own lock holder.
  // Production always supplies connectionString and therefore gets this
  // dedicated, deliberately small lock lane. Multiple users can proceed,
  // while a second operation for the same user fails the try-lock promptly.
  const lockDatabase = connectionString ? new Pool({
    connectionString,
    max: Math.max(2, Math.min(4, poolMax)),
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
    application_name: "zenaian-privacy-locks",
  }) : database;
  const ownsLockPool = Boolean(connectionString);

  function hmacWith(key, value) {
    return createHmac("sha256", key)
      .update(String(value), "utf8")
      .digest("hex");
  }

  function hmac(value) {
    return hmacWith(hmacKeyBytes, value);
  }

  function userHmac(userId) {
    requireUserId(userId);
    return hmac(userId);
  }

  function emailHmac(email) {
    const normalized = normalizePrimaryEmail(email);
    if (!normalized) throw privacyStoreError("Primary email is unavailable.", "PRIVACY_EMAIL_REQUIRED", 409);
    return hmac(normalized);
  }

  function userHmacCandidates(userId) {
    requireUserId(userId);
    return keyring.map((entry) => hmacWith(entry.key, userId));
  }

  function emailHmacCandidates(email) {
    const normalized = normalizePrimaryEmail(email);
    if (!normalized) throw privacyStoreError("Primary email is unavailable.", "PRIVACY_EMAIL_REQUIRED", 409);
    return keyring.map((entry) => hmacWith(entry.key, normalized));
  }

  async function upsertSubjectWithClient(client, { userId, email }) {
    const subjectLookupHmac = emailHmac(email);
    const formerAccountHmac = userHmac(userId);
    await client.query(
      `INSERT INTO privacy_subject_index (
         clerk_user_id, subject_lookup_hmac, former_account_hmac,
         hmac_key_version, updated_at
       ) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (clerk_user_id) DO UPDATE SET
         subject_lookup_hmac = EXCLUDED.subject_lookup_hmac,
         former_account_hmac = EXCLUDED.former_account_hmac,
         hmac_key_version = EXCLUDED.hmac_key_version,
         updated_at = now()`,
      [userId, subjectLookupHmac, formerAccountHmac, hmacKeyVersion],
    );
    return { subjectLookupHmac, formerAccountHmac, hmacKeyVersion };
  }

  async function archiveUserTransactionsWithClient(
    client,
    { userId, email, useStoredIdentity = false },
  ) {
    let identity;
    if (useStoredIdentity) {
      const stored = await client.query(
        `SELECT subject_lookup_hmac, former_account_hmac, hmac_key_version
         FROM privacy_subject_index
         WHERE clerk_user_id = $1`,
        [userId],
      );
      if (!stored.rows[0]) {
        throw privacyStoreError(
          "Privacy subject identity was not prepared before deletion.",
          "PRIVACY_SUBJECT_NOT_PREPARED",
        );
      }
      identity = {
        subjectLookupHmac: String(stored.rows[0].subject_lookup_hmac),
        formerAccountHmac: String(stored.rows[0].former_account_hmac),
        hmacKeyVersion: Number(stored.rows[0].hmac_key_version),
        allowedFormerAccountHmacs: userHmacCandidates(userId),
      };
    } else {
      identity = await upsertSubjectWithClient(client, { userId, email });
      identity.allowedFormerAccountHmacs = userHmacCandidates(userId);
    }
    const memberships = await client.query(
      `SELECT provider_mode, provider_membership_id, company_id, product_id, plan_id,
              plan_code, provider_status, provider_checkout_id,
              checkout_configuration_id, provider_created_at,
              period_started_at, canceled_at, state_changed_at,
              provider_updated_at
       FROM (
         SELECT membership.*,
                membership.checkout_configuration_id AS provider_checkout_id
         FROM billing_memberships AS membership
       ) AS memberships
       WHERE clerk_user_id = $1`,
      [userId],
    );

    for (const row of memberships.rows) {
      const contractedAt = asDate(row.provider_created_at) ||
        asDate(row.period_started_at) || asDate(row.state_changed_at) || new Date();
      const canceledAt = asDate(row.canceled_at);
      const retentionEventAt = laterDate(contractedAt, canceledAt);
      const archived = await client.query(
        `INSERT INTO legal_retention.transaction_records (
           record_id, record_category, subject_lookup_hmac,
           former_account_hmac, hmac_key_version, provider, provider_mode,
           company_id, provider_checkout_id, provider_membership_id, product_id, plan_id,
           plan_code, status, provider_updated_at, contracted_at, canceled_at,
           retention_basis,
           retention_expires_at
         ) VALUES (
           $1, 'contract_withdrawal', $2, $3, $4, 'whop', $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, $15,
           'Korean E-Commerce Act contract/withdrawal record - 5 years', $16
         )
         ON CONFLICT (
           provider, provider_mode, record_category, provider_membership_id
         ) WHERE provider_payment_id IS NULL AND provider_membership_id IS NOT NULL
         DO UPDATE SET
           provider_checkout_id = COALESCE(
             legal_retention.transaction_records.provider_checkout_id,
             EXCLUDED.provider_checkout_id
           ),
           subject_lookup_hmac = EXCLUDED.subject_lookup_hmac,
           former_account_hmac = EXCLUDED.former_account_hmac,
           hmac_key_version = EXCLUDED.hmac_key_version,
           company_id = EXCLUDED.company_id,
           product_id = EXCLUDED.product_id,
           plan_id = EXCLUDED.plan_id,
           plan_code = EXCLUDED.plan_code,
           status = EXCLUDED.status,
           provider_updated_at = GREATEST(
             COALESCE(legal_retention.transaction_records.provider_updated_at,
                      '-infinity'::timestamptz),
             COALESCE(EXCLUDED.provider_updated_at, '-infinity'::timestamptz)
           ),
           canceled_at = COALESCE(
             EXCLUDED.canceled_at,
             legal_retention.transaction_records.canceled_at
           ),
           retention_expires_at = GREATEST(
             legal_retention.transaction_records.retention_expires_at,
             EXCLUDED.retention_expires_at
           ),
           updated_at = now()
         WHERE legal_retention.transaction_records.former_account_hmac =
               ANY($17::text[])
           AND legal_retention.transaction_records.company_id IS NOT DISTINCT
               FROM EXCLUDED.company_id
           AND legal_retention.transaction_records.product_id IS NOT DISTINCT
               FROM EXCLUDED.product_id
           AND legal_retention.transaction_records.plan_id IS NOT DISTINCT
               FROM EXCLUDED.plan_id
           AND legal_retention.transaction_records.plan_code IS NOT DISTINCT
               FROM EXCLUDED.plan_code
           AND COALESCE(
                 legal_retention.transaction_records.provider_updated_at,
                 '-infinity'::timestamptz
               ) <= COALESCE(EXCLUDED.provider_updated_at,
                              '-infinity'::timestamptz)
         RETURNING record_id`,
        [
          randomUUIDFn(),
          identity.subjectLookupHmac,
          identity.formerAccountHmac,
          identity.hmacKeyVersion,
          row.provider_mode,
          row.company_id,
          row.checkout_configuration_id || null,
          row.provider_membership_id,
          row.product_id,
          row.plan_id,
          row.plan_code,
          row.provider_status,
          asDate(row.provider_updated_at),
          contractedAt,
          canceledAt,
          addUtcYears(retentionEventAt, 5),
          identity.allowedFormerAccountHmacs,
        ],
      );
      if (archived.rowCount !== 1) {
        throw privacyStoreError(
          "A retained membership record belongs to another account.",
          "PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT",
          409,
        );
      }
    }

    const payments = await client.query(
      `SELECT provider_mode, provider_payment_id, provider_membership_id,
              provider_checkout_id, company_id, product_id, plan_id,
              plan_code, display_status, provider_substatus,
              settlement_amount, currency, tax_amount, tax_behavior,
              billing_reason, paid_at, provider_created_at,
              provider_updated_at, refunded_at, disputed_at
       FROM billing_payment_history
       WHERE clerk_user_id = $1`,
      [userId],
    );

    for (const row of payments.rows) {
      const evidenceAt = asDate(row.paid_at) || asDate(row.provider_created_at) ||
        asDate(row.provider_updated_at) || new Date();
      await upsertPaymentArchive(client, {
        identity,
        row,
        category: "payment_supply",
        basis: "Korean E-Commerce Act payment/supply record - 5 years",
        eventAt: evidenceAt,
        expiresAt: addUtcYears(evidenceAt, 5),
      });

      if (row.refunded_at || row.display_status === "refunded") {
        const refundedAt = asDate(row.refunded_at) || asDate(row.provider_updated_at) || evidenceAt;
        await upsertPaymentArchive(client, {
          identity,
          row,
          category: "contract_withdrawal",
          basis: "Korean E-Commerce Act contract/withdrawal record - 5 years",
          eventAt: refundedAt,
          expiresAt: addUtcYears(refundedAt, 5),
        });
      }
      if (row.disputed_at || row.display_status === "disputed") {
        const disputedAt = asDate(row.disputed_at) ||
          asDate(row.provider_updated_at) || evidenceAt;
        const disputeEvidenceAt = laterDate(
          disputedAt,
          asDate(row.provider_updated_at),
        );
        await upsertPaymentArchive(client, {
          identity,
          row,
          category: "complaint_dispute",
          basis: "Korean E-Commerce Act complaint/dispute record - 3 years",
          eventAt: disputeEvidenceAt,
          expiresAt: addUtcYears(disputeEvidenceAt, 3),
        });
      }
    }

    await client.query(
      `UPDATE billing_payment_history
       SET archived_at = now(), updated_at = now()
       WHERE clerk_user_id = $1`,
      [userId],
    );
    return { memberships: memberships.rowCount, payments: payments.rowCount };
  }

  async function upsertPaymentArchive(client, {
    identity,
    row,
    category,
    basis,
    eventAt,
    expiresAt,
  }) {
    const refundedAt = category === "contract_withdrawal"
      ? (asDate(row.refunded_at) || eventAt)
      : asDate(row.refunded_at);
    const disputedAt = category === "complaint_dispute"
      ? (asDate(row.disputed_at) || eventAt)
      : asDate(row.disputed_at);
    const archived = await client.query(
      `INSERT INTO legal_retention.transaction_records (
         record_id, record_category, subject_lookup_hmac,
         former_account_hmac, hmac_key_version, provider, provider_mode,
         company_id, provider_checkout_id, provider_membership_id, provider_payment_id,
         product_id, plan_id, plan_code, settlement_amount, currency,
         tax_amount, tax_behavior, billing_reason, status,
         provider_updated_at, paid_at, refunded_at, disputed_at,
         retention_basis, retention_expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'whop', $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
         $25
       )
       ON CONFLICT (
         provider, provider_mode, record_category, provider_payment_id
       ) WHERE provider_payment_id IS NOT NULL
       DO UPDATE SET
         provider_checkout_id = COALESCE(
           legal_retention.transaction_records.provider_checkout_id,
           EXCLUDED.provider_checkout_id
         ),
         provider_membership_id = COALESCE(
           legal_retention.transaction_records.provider_membership_id,
           EXCLUDED.provider_membership_id
         ),
         subject_lookup_hmac = EXCLUDED.subject_lookup_hmac,
         former_account_hmac = EXCLUDED.former_account_hmac,
         hmac_key_version = EXCLUDED.hmac_key_version,
         company_id = EXCLUDED.company_id,
         product_id = EXCLUDED.product_id,
         plan_id = EXCLUDED.plan_id,
         plan_code = EXCLUDED.plan_code,
         settlement_amount = COALESCE(
           EXCLUDED.settlement_amount,
           legal_retention.transaction_records.settlement_amount
         ),
         currency = COALESCE(EXCLUDED.currency,
                             legal_retention.transaction_records.currency),
         tax_amount = COALESCE(EXCLUDED.tax_amount,
                               legal_retention.transaction_records.tax_amount),
         tax_behavior = COALESCE(EXCLUDED.tax_behavior,
                                 legal_retention.transaction_records.tax_behavior),
         billing_reason = COALESCE(EXCLUDED.billing_reason,
                                   legal_retention.transaction_records.billing_reason),
         status = EXCLUDED.status,
         provider_updated_at = GREATEST(
           COALESCE(legal_retention.transaction_records.provider_updated_at,
                    '-infinity'::timestamptz),
           COALESCE(EXCLUDED.provider_updated_at, '-infinity'::timestamptz)
         ),
         paid_at = COALESCE(legal_retention.transaction_records.paid_at,
                            EXCLUDED.paid_at),
         refunded_at = COALESCE(EXCLUDED.refunded_at,
                                legal_retention.transaction_records.refunded_at),
         disputed_at = COALESCE(EXCLUDED.disputed_at,
                                legal_retention.transaction_records.disputed_at),
         retention_expires_at = GREATEST(
           legal_retention.transaction_records.retention_expires_at,
           EXCLUDED.retention_expires_at
         ),
         updated_at = now()
       WHERE legal_retention.transaction_records.former_account_hmac =
             ANY($26::text[])
         AND legal_retention.transaction_records.company_id IS NOT DISTINCT
             FROM EXCLUDED.company_id
         AND legal_retention.transaction_records.product_id IS NOT DISTINCT
             FROM EXCLUDED.product_id
         AND legal_retention.transaction_records.plan_id IS NOT DISTINCT
             FROM EXCLUDED.plan_id
         AND legal_retention.transaction_records.plan_code IS NOT DISTINCT
             FROM EXCLUDED.plan_code
         AND COALESCE(
               legal_retention.transaction_records.provider_updated_at,
               '-infinity'::timestamptz
             ) <= COALESCE(EXCLUDED.provider_updated_at,
                            '-infinity'::timestamptz)
       RETURNING record_id`,
      [
        randomUUIDFn(), category, identity.subjectLookupHmac,
        identity.formerAccountHmac, identity.hmacKeyVersion, row.provider_mode,
        row.company_id || null, row.provider_checkout_id || null,
        row.provider_membership_id || null, row.provider_payment_id,
        row.product_id || null, row.plan_id || null,
        row.plan_code || null, finiteNumberOrNull(row.settlement_amount),
        safeCurrency(row.currency), finiteNumberOrNull(row.tax_amount),
        safeToken(row.tax_behavior), safeToken(row.billing_reason),
        safeStatus(row.provider_substatus || row.display_status),
        asDate(row.provider_updated_at), asDate(row.paid_at), refundedAt,
        disputedAt, basis, expiresAt,
        identity.allowedFormerAccountHmacs,
      ],
    );
    if (archived.rowCount !== 1) {
      throw privacyStoreError(
        "A retained payment record belongs to another account.",
        "PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT",
        409,
      );
    }
  }

  return {
    async initialize() {
      const result = await database.query(
        `SELECT
           to_regclass('legal_retention.transaction_records') AS archive_table,
           to_regclass('privacy_request_audit') AS audit_table,
           to_regclass('privacy_deletion_queue') AS queue_table,
           to_regclass('privacy_subject_index') AS subject_table,
           to_regclass('billing_checkout_tombstones') AS tombstone_table`,
      );
      if (
        !result.rows[0]?.archive_table || !result.rows[0]?.audit_table ||
        !result.rows[0]?.queue_table || !result.rows[0]?.subject_table ||
        !result.rows[0]?.tombstone_table
      ) {
        throw privacyStoreError(
          "Privacy database migrations have not been applied.",
          "PRIVACY_DATABASE_NOT_MIGRATED",
        );
      }
    },

    async close() {
      if (ownsPool) await database.end();
      if (ownsLockPool) await lockDatabase.end();
    },

    userHmac,
    emailHmac,
    userHmacCandidates,
    emailHmacCandidates,

    async upsertSubject({ userId, email }) {
      try {
        return await upsertSubjectWithClient(database, { userId, email });
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async hasSubjectIdentity(userId) {
      requireUserId(userId);
      try {
        const result = await database.query(
          `SELECT 1 FROM privacy_subject_index
           WHERE clerk_user_id = $1`,
          [userId],
        );
        return result.rowCount === 1;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async prepareDeletionIdentity({ requestId, userId, email }) {
      requireUserId(userId);
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const queued = await client.query(
          `SELECT 1
           FROM privacy_deletion_queue
           WHERE request_id = $1 AND clerk_user_id = $2
           FOR UPDATE`,
          [requestId, userId],
        );
        if (queued.rowCount !== 1) {
          throw privacyStoreError(
            "The account deletion request is unavailable.",
            "PRIVACY_DELETION_REQUEST_MISSING",
            409,
          );
        }
        // Transaction-local and accepted by the DB trigger only for the
        // already-blocked subject. It cannot reopen any other write path.
        await client.query(
          "SELECT set_config('zenaian.privacy_deletion_worker', 'on', true)",
        );
        const identity = await upsertSubjectWithClient(client, { userId, email });
        await client.query(
          `UPDATE privacy_deletion_queue
           SET identity_loaded = true, updated_at = now()
           WHERE request_id = $1 AND clerk_user_id = $2`,
          [requestId, userId],
        );
        await client.query("COMMIT");
        return identity;
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async isDeletionBlocked(userId) {
      const subjectHmacs = userHmacCandidates(userId);
      try {
        const result = await database.query(
          `SELECT state FROM (
             SELECT state, 0 AS priority
             FROM privacy_deletion_queue
             WHERE clerk_user_id = $1
             UNION ALL
             SELECT state, 1 AS priority
             FROM privacy_request_audit
             WHERE subject_hmac = ANY($2::text[])
               AND request_type = 'delete'
               AND state = ANY($3::text[])
           ) AS block
           ORDER BY priority LIMIT 1`,
          [userId, subjectHmacs, ACTIVE_DELETION_STATES],
        );
        return result.rows[0]?.state || "";
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async getDeletionForUser(userId) {
      requireUserId(userId);
      try {
        const result = await database.query(
          `SELECT request_id, state
           FROM privacy_deletion_queue
           WHERE clerk_user_id = $1`,
          [userId],
        );
        return result.rows[0]
          ? {
              requestId: String(result.rows[0].request_id),
              state: String(result.rows[0].state),
            }
          : null;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async beginExport(userId, at = new Date()) {
      requireUserId(userId);
      const requestId = randomUUIDFn();
      try {
        // Global and per-account request limiters already bound this route.
        // Do not impose a multi-minute privacy-export cooldown: the export
        // payload is never stored, so users must be able to retry immediately
        // after a failed download and may legitimately download another copy.
        await database.query(
          `INSERT INTO privacy_request_audit (
             request_id, subject_hmac, request_type, state, received_at,
             purge_after
           ) VALUES ($1, $2, 'export', 'received', $3, $4)`,
          [requestId, userHmac(userId), at, new Date(at.getTime() + 365 * DAY_MS)],
        );
        return requestId;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async beginDeletion(userId, at = new Date()) {
      requireUserId(userId);
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
        const subjectHmac = userHmac(userId);
        const subjectHmacs = userHmacCandidates(userId);
        const existing = await client.query(
          `SELECT request_id, state
           FROM privacy_request_audit
           WHERE subject_hmac = ANY($1::text[]) AND request_type = 'delete'
           FOR UPDATE`,
          [subjectHmacs],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return {
            requestId: String(existing.rows[0].request_id),
            state: String(existing.rows[0].state),
            existing: true,
          };
        }

        const requestId = randomUUIDFn();
        await client.query(
          `INSERT INTO privacy_request_audit (
             request_id, subject_hmac, request_type, state, received_at,
             purge_after
           ) VALUES ($1, $2, 'delete', 'blocked', $3, $4)`,
          [requestId, subjectHmac, at, new Date(at.getTime() + 365 * DAY_MS)],
        );
        await client.query(
          `INSERT INTO privacy_deletion_queue (
             request_id, clerk_user_id, state, next_retry_at
           ) VALUES ($1, $2, 'blocked', $3)`,
          [requestId, userId, at],
        );
        await client.query("COMMIT");
        return { requestId, state: "blocked", existing: false };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async finishRequest(requestId, state, exceptionCode = null, at = new Date()) {
      if (!new Set(["complete", "failed", "partial"]).has(state)) {
        throw new Error("Privacy request completion state is invalid.");
      }
      try {
        const result = await database.query(
          `UPDATE privacy_request_audit
           SET state = $2,
               completed_at = CASE WHEN $2 IN ('complete', 'failed') THEN $4 ELSE NULL END,
               exception_code = $3,
               purge_after = CASE
                 WHEN $2 IN ('complete', 'failed') THEN $4 + interval '1 year'
                 ELSE purge_after
               END,
               updated_at = $4
           WHERE request_id = $1`,
          [requestId, state, exceptionCode, at],
        );
        return result.rowCount === 1;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async markDeletionPartial(requestId, errorCode, at = new Date()) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE privacy_request_audit
           SET state = 'partial', exception_code = $2, updated_at = $3
           WHERE request_id = $1 AND request_type = 'delete'`,
          [requestId, safeErrorCode(errorCode), at],
        );
        await client.query(
          `UPDATE privacy_deletion_queue
           SET state = 'partial', attempt_count = attempt_count + 1,
               next_retry_at = $2 + (
                 LEAST(3600, 30 * power(2, LEAST(attempt_count, 7))) * interval '1 second'
               ),
               last_error_code = $3, updated_at = $2
           WHERE request_id = $1`,
          [requestId, at, safeErrorCode(errorCode)],
        );
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async markDeletionComplete(requestId, at = new Date()) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE privacy_request_audit
           SET state = 'complete', completed_at = $2, exception_code = NULL,
               purge_after = $2 + interval '1 year', updated_at = $2
           WHERE request_id = $1 AND request_type = 'delete'`,
          [requestId, at],
        );
        await client.query(
          "DELETE FROM privacy_deletion_queue WHERE request_id = $1",
          [requestId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async listDeletionRetries(limit = 10, at = new Date()) {
      const bounded = Math.max(1, Math.min(50, Number.isSafeInteger(limit) ? limit : 10));
      try {
        const result = await database.query(
          `SELECT request_id, clerk_user_id, state, attempt_count,
                  identity_loaded, archive_complete,
                  provider_cancellation_complete, local_deletion_complete,
                  clerk_deletion_started
           FROM privacy_deletion_queue
           WHERE next_retry_at <= $1
           ORDER BY next_retry_at, request_id
           LIMIT $2`,
          [at, bounded],
        );
        return result.rows.map((row) => ({
          requestId: String(row.request_id),
          userId: String(row.clerk_user_id),
          state: String(row.state),
          attemptCount: Number(row.attempt_count),
          identityLoaded: Boolean(row.identity_loaded),
          archiveComplete: Boolean(row.archive_complete),
          providerCancellationComplete: Boolean(row.provider_cancellation_complete),
          localDeletionComplete: Boolean(row.local_deletion_complete),
          clerkDeletionStarted: Boolean(row.clerk_deletion_started),
        }));
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async getDeletionProgress(requestId, userId) {
      try {
        const result = await database.query(
          `SELECT request_id, clerk_user_id, state, attempt_count,
                  identity_loaded, archive_complete,
                  provider_cancellation_complete, local_deletion_complete,
                  clerk_deletion_started
           FROM privacy_deletion_queue
           WHERE request_id = $1 AND clerk_user_id = $2`,
          [requestId, userId],
        );
        const row = result.rows[0];
        return row ? {
          requestId: String(row.request_id),
          userId: String(row.clerk_user_id),
          state: String(row.state),
          attemptCount: Number(row.attempt_count),
          identityLoaded: Boolean(row.identity_loaded),
          archiveComplete: Boolean(row.archive_complete),
          providerCancellationComplete: Boolean(row.provider_cancellation_complete),
          localDeletionComplete: Boolean(row.local_deletion_complete),
          clerkDeletionStarted: Boolean(row.clerk_deletion_started),
        } : null;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async updateDeletionProgress(requestId, fields, at = new Date()) {
      const allowed = [
        "identityLoaded", "archiveComplete", "providerCancellationComplete",
        "localDeletionComplete", "clerkDeletionStarted",
      ];
      const updates = allowed.filter((name) => fields?.[name] === true);
      if (!updates.length) return false;
      const columns = {
        identityLoaded: "identity_loaded",
        archiveComplete: "archive_complete",
        providerCancellationComplete: "provider_cancellation_complete",
        localDeletionComplete: "local_deletion_complete",
        clerkDeletionStarted: "clerk_deletion_started",
      };
      const assignments = updates.map((name) => `${columns[name]} = true`);
      try {
        const result = await database.query(
          `UPDATE privacy_deletion_queue
           SET ${assignments.join(", ")}, updated_at = $2
           WHERE request_id = $1`,
          [requestId, at],
        );
        return result.rowCount === 1;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async withDeletionLock(userId, callback) {
      requireUserId(userId);
      const client = await lockDatabase.connect();
      let acquired = false;
      try {
        const result = await client.query(
          "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
          [userId],
        );
        acquired = result.rows[0]?.acquired === true;
        if (!acquired) return { acquired: false, value: null };
        return { acquired: true, value: await callback() };
      } finally {
        if (acquired) {
          await client.query(
            "SELECT pg_advisory_unlock(hashtext($1))",
            [userId],
          ).catch(() => undefined);
        }
        client.release();
      }
    },

    async archiveUserTransactions({ userId, email, useStoredIdentity = false }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const result = await archiveUserTransactionsWithClient(client, {
          userId,
          email,
          useStoredIdentity,
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async listRenewalMemberships(userId) {
      requireUserId(userId);
      try {
        const result = await database.query(
          `SELECT provider_mode, provider_membership_id, provider_status,
                  cancel_at_period_end, access_state
           FROM billing_memberships
           WHERE clerk_user_id = $1
             AND access_state <> 'inactive'
           ORDER BY provider_updated_at DESC`,
          [userId],
        );
        return result.rows.map((row) => ({
          mode: String(row.provider_mode),
          id: String(row.provider_membership_id),
          providerStatus: String(row.provider_status),
          cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
          accessState: String(row.access_state),
        }));
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async prepareDeletionMembershipRetries({ requestId, userId }) {
      requireUserId(userId);
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const queued = await client.query(
          `SELECT 1 FROM privacy_deletion_queue
           WHERE request_id = $1 AND clerk_user_id = $2
           FOR UPDATE`,
          [requestId, userId],
        );
        if (queued.rowCount !== 1) {
          throw privacyStoreError(
            "The account deletion request is unavailable.",
            "PRIVACY_DELETION_REQUEST_MISSING",
            409,
          );
        }
        await client.query(
          `INSERT INTO privacy_deletion_membership_retries (
             request_id, provider_mode, provider_membership_id
           )
           SELECT $1, provider_mode, provider_membership_id
           FROM billing_memberships
           WHERE clerk_user_id = $2 AND access_state <> 'inactive'
           ON CONFLICT DO NOTHING`,
          [requestId, userId],
        );
        const retries = await client.query(
          `SELECT provider_mode, provider_membership_id
           FROM privacy_deletion_membership_retries
           WHERE request_id = $1
           ORDER BY provider_mode, provider_membership_id`,
          [requestId],
        );
        await client.query("COMMIT");
        return retries.rows.map((row) => ({
          mode: String(row.provider_mode),
          id: String(row.provider_membership_id),
        }));
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async recordProviderCancellation({ userId, membership, at = new Date() }) {
      requireUserId(userId);
      const providerMembershipId = String(membership?.id || "");
      const mode = String(membership?.mode || "");
      if (!/^mem_[A-Za-z0-9_-]{6,120}$/.test(providerMembershipId)) {
        throw privacyStoreError(
          "Provider membership identifier is invalid.",
          "PRIVACY_PROVIDER_MISMATCH",
          502,
        );
      }
      if (!new Set(["test", "live"]).has(mode)) {
        throw privacyStoreError(
          "Provider mode is invalid.",
          "PRIVACY_PROVIDER_MISMATCH",
          502,
        );
      }
      const canceledAt = asDate(membership.canceledAt) ||
        asDate(membership.updatedAt) || at;
      const providerUpdatedAt = asDate(membership.updatedAt) || canceledAt;
      const formerAccountHmacs = userHmacCandidates(userId);
      try {
        const result = await database.query(
          `UPDATE legal_retention.transaction_records
           SET status = 'cancel_at_period_end',
               provider_updated_at = GREATEST(
                 COALESCE(provider_updated_at, '-infinity'::timestamptz),
                 $5
               ),
               canceled_at = COALESCE(canceled_at, $4),
               retention_expires_at = GREATEST(
                 retention_expires_at,
                 $4 + interval '5 years'
               ),
               updated_at = $4
           WHERE provider = 'whop'
             AND provider_mode = $1
             AND provider_membership_id = $2
             AND record_category = 'contract_withdrawal'
             AND former_account_hmac = ANY($3::text[])
           RETURNING record_id`,
          [
            mode,
            providerMembershipId,
            formerAccountHmacs,
            canceledAt,
            providerUpdatedAt,
          ],
        );
        if (result.rowCount !== 1) {
          throw privacyStoreError(
            "Retained membership cancellation evidence was not found.",
            "PRIVACY_ARCHIVE_MEMBERSHIP_MISSING",
          );
        }
        return true;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async exportRows({ userId, email }) {
      requireUserId(userId);
      await this.upsertSubject({ userId, email });
      const subjectHmacs = emailHmacCandidates(email);
      const formerAccountHmacs = userHmacCandidates(userId);
      try {
        const [usage, analyses, checkouts, memberships, payments, devices, pairings, archive] =
          await Promise.all([
            database.query(
              `SELECT period_key, plan_id, allowance, consumed, reserved,
                      starts_at, ends_at
               FROM billing_usage_periods
               WHERE clerk_user_id = $1 ORDER BY ends_at DESC`,
              [userId],
            ),
            database.query(
              `SELECT plan_id, model_id, state, created_at, settled_at
               FROM billing_analysis_usage
               WHERE clerk_user_id = $1 ORDER BY created_at DESC`,
              [userId],
            ),
            database.query(
              `SELECT requested_plan, provider, provider_mode, company_id,
                      product_id, plan_id, status, provider_checkout_id,
                      expires_at, created_at, updated_at, consumed_at
               FROM billing_checkout_sessions
               WHERE clerk_user_id = $1 ORDER BY created_at DESC`,
              [userId],
            ),
            database.query(
              `SELECT provider, provider_mode, provider_membership_id,
                      company_id, product_id, plan_id, plan_code,
                      provider_status, access_state, renewal_period_start,
                      renewal_period_end, cancel_at_period_end, canceled_at,
                      provider_created_at, provider_updated_at
               FROM billing_memberships
               WHERE clerk_user_id = $1 ORDER BY provider_updated_at DESC`,
              [userId],
            ),
            database.query(
              `SELECT provider_mode, provider_payment_id,
                      provider_membership_id, plan_code, display_status,
                      provider_substatus, settlement_amount, currency,
                      tax_amount, tax_behavior, billing_reason, paid_at,
                      refunded_at, disputed_at, provider_created_at,
                      provider_updated_at
               FROM billing_payment_history
               WHERE clerk_user_id = $1 ORDER BY provider_updated_at DESC`,
              [userId],
            ),
            database.query(
              `SELECT extension_id, issued_at, access_expires_at,
                      refresh_expires_at, revoked_at, last_seen_at
               FROM extension_device_sessions
               WHERE clerk_user_id = $1 ORDER BY last_seen_at DESC`,
              [userId],
            ),
            database.query(
              `SELECT extension_id, expires_at, consumed_at, created_at
               FROM extension_pairing_grants
               WHERE clerk_user_id = $1 ORDER BY created_at DESC`,
              [userId],
            ),
            database.query(
              `SELECT record_category, provider, provider_mode,
                      company_id, provider_checkout_id, provider_membership_id,
                      provider_payment_id, product_id, plan_id, plan_code,
                      settlement_amount, currency, tax_amount, tax_behavior,
                      billing_reason, status, provider_updated_at,
                      contracted_at, paid_at,
                      canceled_at, refunded_at, disputed_at,
                      retention_basis, retention_expires_at
               FROM legal_retention.transaction_records
               WHERE subject_lookup_hmac = ANY($1::text[])
                  OR former_account_hmac = ANY($2::text[])
               ORDER BY created_at DESC`,
              [subjectHmacs, formerAccountHmacs],
            ),
          ]);
        return {
          usagePeriods: usage.rows,
          analysisAccounting: analyses.rows,
          checkoutSessions: checkouts.rows,
          memberships: memberships.rows,
          paymentHistory: payments.rows,
          extensionDeviceSessions: devices.rows,
          extensionPairings: pairings.rows,
          statutoryTransactionRecords: archive.rows,
        };
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async deleteDeviceRows(userId) {
      requireUserId(userId);
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM extension_pairing_grants WHERE clerk_user_id = $1", [userId]);
        await client.query("DELETE FROM extension_device_sessions WHERE clerk_user_id = $1", [userId]);
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async deleteOperationalRows(userId) {
      requireUserId(userId);
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        // Whop checkout configurations have no documented revocation or
        // bounded validity. Preserve every checkout known to this deleted
        // account, including consumed rows and provider evidence whose live
        // checkout row has already aged out. Prior legitimate memberships
        // are retained separately from any later membership that must be
        // terminated after the checkout is reused.
        const tombstones = await client.query(
          `WITH raw_candidates AS (
             SELECT checkout.provider_mode, checkout.provider_checkout_id,
                    checkout.company_id, checkout.product_id,
                    checkout.plan_id, checkout.requested_plan AS plan_code,
                    NULL::text AS prior_membership_id
             FROM billing_checkout_sessions AS checkout
             WHERE checkout.clerk_user_id = $1
               AND checkout.provider_checkout_id IS NOT NULL
             UNION ALL
             SELECT membership.provider_mode,
                    membership.checkout_configuration_id,
                    membership.company_id, membership.product_id,
                    membership.plan_id, membership.plan_code,
                    membership.provider_membership_id
             FROM billing_memberships AS membership
             WHERE membership.clerk_user_id = $1
               AND membership.checkout_configuration_id IS NOT NULL
             UNION ALL
             SELECT payment.provider_mode, payment.provider_checkout_id,
                    payment.company_id, payment.product_id, payment.plan_id,
                    payment.plan_code, payment.provider_membership_id
             FROM billing_payment_history AS payment
             WHERE payment.clerk_user_id = $1
               AND payment.provider_checkout_id IS NOT NULL
             UNION ALL
             SELECT archive.provider_mode, archive.provider_checkout_id,
                    archive.company_id, archive.product_id, archive.plan_id,
                    archive.plan_code, archive.provider_membership_id
             FROM legal_retention.transaction_records AS archive
             WHERE archive.provider = 'whop'
               AND archive.former_account_hmac = ANY($2::text[])
               AND archive.provider_checkout_id IS NOT NULL
           ), candidates AS (
             SELECT provider_mode, provider_checkout_id,
                    min(company_id) AS company_id,
                    min(product_id) AS product_id,
                    min(plan_id) AS plan_id,
                    min(plan_code) AS plan_code,
                    COALESCE(
                      array_agg(DISTINCT prior_membership_id
                                ORDER BY prior_membership_id)
                        FILTER (WHERE prior_membership_id IS NOT NULL),
                      '{}'::text[]
                    ) AS prior_membership_ids
             FROM raw_candidates
             GROUP BY provider_mode, provider_checkout_id
             HAVING count(DISTINCT company_id) = 1
                AND count(DISTINCT product_id) = 1
                AND count(DISTINCT plan_id) = 1
                AND count(DISTINCT plan_code) = 1
           ), stored AS (
             INSERT INTO billing_checkout_tombstones (
               provider_mode, provider_checkout_id, company_id, product_id,
               plan_id, plan_code, prior_membership_ids
             )
             SELECT provider_mode, provider_checkout_id, company_id, product_id,
                    plan_id, plan_code, prior_membership_ids
             FROM candidates
             ON CONFLICT (provider_mode, provider_checkout_id) DO UPDATE SET
               prior_membership_ids = (
                 SELECT COALESCE(
                   array_agg(DISTINCT membership_id ORDER BY membership_id),
                   '{}'::text[]
                 )
                 FROM unnest(
                   billing_checkout_tombstones.prior_membership_ids ||
                   EXCLUDED.prior_membership_ids
                 ) AS prior(membership_id)
               )
             WHERE billing_checkout_tombstones.company_id = EXCLUDED.company_id
               AND billing_checkout_tombstones.product_id = EXCLUDED.product_id
               AND billing_checkout_tombstones.plan_id = EXCLUDED.plan_id
               AND billing_checkout_tombstones.plan_code = EXCLUDED.plan_code
             RETURNING provider_checkout_id
           )
           SELECT (
                    SELECT count(DISTINCT (
                      provider_mode, provider_checkout_id
                    )) FROM raw_candidates
                  ) AS expected,
                  (SELECT count(*) FROM stored) AS stored`,
          [userId, userHmacCandidates(userId)],
        );
        if (
          Number(tombstones.rows[0]?.expected || 0) !==
          Number(tombstones.rows[0]?.stored || 0)
        ) {
          throw privacyStoreError(
            "A deleted checkout could not be safely tombstoned.",
            "PRIVACY_CHECKOUT_TOMBSTONE_CONFLICT",
            409,
          );
        }
        const ids = await client.query(
          `SELECT
             ARRAY(SELECT provider_membership_id FROM billing_memberships
                   WHERE clerk_user_id = $1) AS membership_ids,
             ARRAY(SELECT provider_payment_id FROM billing_payment_history
                   WHERE clerk_user_id = $1) AS payment_ids,
             ARRAY(SELECT provider_checkout_id FROM billing_checkout_sessions
                   WHERE clerk_user_id = $1
                     AND provider_checkout_id IS NOT NULL) AS checkout_ids`,
          [userId],
        );
        const resourceIds = [
          ...(ids.rows[0]?.membership_ids || []),
          ...(ids.rows[0]?.payment_ids || []),
          ...(ids.rows[0]?.checkout_ids || []),
        ].filter(Boolean);

        await client.query("DELETE FROM billing_analysis_usage WHERE clerk_user_id = $1", [userId]);
        await client.query("DELETE FROM billing_usage_periods WHERE clerk_user_id = $1", [userId]);
        await client.query("DELETE FROM billing_payment_history WHERE clerk_user_id = $1", [userId]);
        await client.query("DELETE FROM billing_checkout_sessions WHERE clerk_user_id = $1", [userId]);
        await client.query("DELETE FROM billing_memberships WHERE clerk_user_id = $1", [userId]);
        if (resourceIds.length) {
          await client.query(
            `DELETE FROM billing_provider_events
             WHERE resource_id = ANY($1::text[])`,
            [resourceIds],
          );
        }
        await client.query("DELETE FROM extension_pairing_grants WHERE clerk_user_id = $1", [userId]);
        await client.query("DELETE FROM extension_device_sessions WHERE clerk_user_id = $1", [userId]);
        await client.query("DELETE FROM privacy_subject_index WHERE clerk_user_id = $1", [userId]);
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizePrivacyStoreError(error);
      } finally {
        client.release();
      }
    },

    async expireCheckoutSessions(at = new Date(), batchSize = 500) {
      const limit = Math.max(
        1,
        Math.min(2000, Number.isSafeInteger(batchSize) ? batchSize : 500),
      );
      try {
        const expired = await database.query(
          `WITH selected AS (
             SELECT id
             FROM billing_checkout_sessions
             WHERE (
               status IN ('pending', 'checkout_created') AND expires_at <= $1
             ) OR (
               checkout_url IS NOT NULL AND status = 'consumed'
             )
             ORDER BY expires_at, id
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           )
           UPDATE billing_checkout_sessions AS checkout
           SET status = CASE
                 WHEN checkout.status IN ('pending', 'checkout_created')
                      AND checkout.expires_at <= $1
                 THEN 'expired' ELSE checkout.status END,
               checkout_url = NULL,
               updated_at = CASE
                 WHEN checkout.status IN ('pending', 'checkout_created')
                      AND checkout.expires_at <= $1
                 THEN $1 ELSE checkout.updated_at END
           FROM selected WHERE checkout.id = selected.id`,
          [at, limit],
        );
        return expired.rowCount;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    async purgeRetention(at = new Date(), batchSize = 500) {
      const limit = Math.max(1, Math.min(2000, Number.isSafeInteger(batchSize) ? batchSize : 500));
      const counts = {};
      try {
        counts.analysisUsage = await deleteBatch(database,
          `SELECT usage.operation_id FROM billing_analysis_usage AS usage
           WHERE usage.state IN ('consumed', 'released')
             AND usage.settled_at < $1 - interval '30 days'
           ORDER BY usage.settled_at, usage.operation_id LIMIT $2
           FOR UPDATE OF usage SKIP LOCKED`,
          "billing_analysis_usage", "operation_id", [at, limit],
          `target.state IN ('consumed', 'released')
           AND target.settled_at < $1 - interval '30 days'`);
        counts.usagePeriods = await deleteBatch(database,
          `SELECT period.id FROM billing_usage_periods AS period
           WHERE period.ends_at < $1 - interval '90 days'
             AND NOT EXISTS (SELECT 1 FROM billing_analysis_usage AS usage
                             WHERE usage.usage_period_id = period.id)
           ORDER BY period.ends_at, period.id LIMIT $2
           FOR UPDATE OF period SKIP LOCKED`,
          "billing_usage_periods", "id", [at, limit],
          `target.ends_at < $1 - interval '90 days'
           AND NOT EXISTS (
             SELECT 1 FROM billing_analysis_usage AS usage
             WHERE usage.usage_period_id = target.id
           )`);
        counts.checkouts = await deleteBatch(database,
          `SELECT checkout.id FROM billing_checkout_sessions AS checkout
           WHERE (
             (checkout.status IN ('failed', 'expired')
              AND checkout.updated_at < $1 - interval '7 days') OR
             (checkout.status = 'consumed'
              AND COALESCE(checkout.consumed_at, checkout.updated_at) <
                $1 - interval '30 days')
           ) ORDER BY checkout.updated_at, checkout.id LIMIT $2
           FOR UPDATE OF checkout SKIP LOCKED`,
          "billing_checkout_sessions", "id", [at, limit],
          `(
             (target.status IN ('failed', 'expired')
              AND target.updated_at < $1 - interval '7 days') OR
             (target.status = 'consumed'
              AND COALESCE(target.consumed_at, target.updated_at) <
                $1 - interval '30 days')
           )`);
        const providerEvents = await database.query(
          `WITH doomed AS (
             SELECT candidate.provider, candidate.provider_mode,
                    candidate.delivery_id
             FROM billing_provider_events AS candidate
             WHERE candidate.received_at < $1 - interval '30 days'
             ORDER BY candidate.received_at, candidate.delivery_id LIMIT $2
             FOR UPDATE OF candidate SKIP LOCKED
           )
           DELETE FROM billing_provider_events AS event
           USING doomed
           WHERE event.provider = doomed.provider
             AND event.provider_mode = doomed.provider_mode
             AND event.delivery_id = doomed.delivery_id
             AND event.received_at < $1 - interval '30 days'`,
          [at, limit],
        );
        counts.providerEvents = providerEvents.rowCount;
        const paymentHistory = await database.query(
          `WITH doomed AS (
             SELECT candidate.provider_mode, candidate.provider_payment_id
             FROM billing_payment_history AS candidate
             WHERE candidate.archived_at IS NOT NULL
               AND candidate.provider_updated_at < $1 - interval '12 months'
               AND EXISTS (
                 SELECT 1
                 FROM legal_retention.transaction_records AS archive
                 JOIN privacy_subject_index AS identity
                   ON identity.clerk_user_id = candidate.clerk_user_id
                  AND identity.former_account_hmac =
                      archive.former_account_hmac
                 WHERE archive.provider = 'whop'
                   AND archive.provider_mode = candidate.provider_mode
                   AND archive.record_category = 'payment_supply'
                   AND archive.provider_payment_id =
                       candidate.provider_payment_id
                   AND archive.company_id IS NOT DISTINCT FROM candidate.company_id
                   AND archive.product_id IS NOT DISTINCT FROM candidate.product_id
                   AND archive.plan_id IS NOT DISTINCT FROM candidate.plan_id
                   AND archive.plan_code IS NOT DISTINCT FROM candidate.plan_code
               )
             ORDER BY candidate.provider_updated_at,
                      candidate.provider_payment_id LIMIT $2
             FOR UPDATE OF candidate SKIP LOCKED
           )
           DELETE FROM billing_payment_history AS payment
           USING doomed
           WHERE payment.provider_mode = doomed.provider_mode
             AND payment.provider_payment_id = doomed.provider_payment_id
             AND payment.archived_at IS NOT NULL
             AND payment.provider_updated_at < $1 - interval '12 months'
             AND EXISTS (
               SELECT 1
               FROM legal_retention.transaction_records AS archive
               JOIN privacy_subject_index AS identity
                 ON identity.clerk_user_id = payment.clerk_user_id
                AND identity.former_account_hmac = archive.former_account_hmac
               WHERE archive.provider = 'whop'
                 AND archive.provider_mode = payment.provider_mode
                 AND archive.record_category = 'payment_supply'
                 AND archive.provider_payment_id = payment.provider_payment_id
                 AND archive.company_id IS NOT DISTINCT FROM payment.company_id
                 AND archive.product_id IS NOT DISTINCT FROM payment.product_id
                 AND archive.plan_id IS NOT DISTINCT FROM payment.plan_id
                 AND archive.plan_code IS NOT DISTINCT FROM payment.plan_code
             )`,
          [at, limit],
        );
        counts.paymentHistory = paymentHistory.rowCount;
        const memberships = await database.query(
          `WITH doomed AS (
             SELECT membership.provider_mode,
                    membership.provider_membership_id
             FROM billing_memberships AS membership
             WHERE membership.access_state IN ('inactive', 'revoked')
               AND membership.state_changed_at < $1 - interval '90 days'
               AND (membership.access_state <> 'revoked' OR membership.cancel_at_period_end)
               AND EXISTS (
                 SELECT 1 FROM legal_retention.transaction_records AS archive
                 JOIN privacy_subject_index AS identity
                   ON identity.clerk_user_id = membership.clerk_user_id
                  AND identity.former_account_hmac =
                      archive.former_account_hmac
                 WHERE archive.provider = 'whop'
                   AND archive.provider_mode = membership.provider_mode
                   AND archive.record_category = 'contract_withdrawal'
                   AND archive.provider_membership_id =
                       membership.provider_membership_id
                   AND archive.company_id IS NOT DISTINCT FROM membership.company_id
                   AND archive.product_id IS NOT DISTINCT FROM membership.product_id
                   AND archive.plan_id IS NOT DISTINCT FROM membership.plan_id
                   AND archive.plan_code IS NOT DISTINCT FROM membership.plan_code
               )
             ORDER BY membership.state_changed_at, membership.provider_membership_id
             LIMIT $2
             FOR UPDATE OF membership SKIP LOCKED
           )
           DELETE FROM billing_memberships AS membership
           USING doomed
           WHERE membership.provider_mode = doomed.provider_mode
             AND membership.provider_membership_id = doomed.provider_membership_id
             AND membership.access_state IN ('inactive', 'revoked')
             AND membership.state_changed_at < $1 - interval '90 days'
             AND (
               membership.access_state <> 'revoked' OR
               membership.cancel_at_period_end
             )
             AND EXISTS (
               SELECT 1 FROM legal_retention.transaction_records AS archive
               JOIN privacy_subject_index AS identity
                 ON identity.clerk_user_id = membership.clerk_user_id
                AND identity.former_account_hmac = archive.former_account_hmac
               WHERE archive.provider = 'whop'
                 AND archive.provider_mode = membership.provider_mode
                 AND archive.record_category = 'contract_withdrawal'
                 AND archive.provider_membership_id =
                   membership.provider_membership_id
                 AND archive.company_id IS NOT DISTINCT FROM membership.company_id
                 AND archive.product_id IS NOT DISTINCT FROM membership.product_id
                 AND archive.plan_id IS NOT DISTINCT FROM membership.plan_id
                 AND archive.plan_code IS NOT DISTINCT FROM membership.plan_code
             )`,
          [at, limit],
        );
        counts.memberships = memberships.rowCount;
        counts.legalArchive = await deleteBatch(database,
          `SELECT archive.record_id
           FROM legal_retention.transaction_records AS archive
           WHERE archive.retention_expires_at <= $1
           ORDER BY archive.retention_expires_at, archive.record_id LIMIT $2
           FOR UPDATE OF archive SKIP LOCKED`,
          "legal_retention.transaction_records", "record_id", [at, limit],
          "target.retention_expires_at <= $1");
        const audits = await database.query(
          `WITH doomed AS (
             SELECT audit.request_id
             FROM privacy_request_audit AS audit
             WHERE audit.purge_after <= $1
               AND (
                 audit.state IN ('complete', 'failed') OR
                 (audit.request_type = 'export' AND audit.state = 'received')
               )
               AND NOT EXISTS (SELECT 1 FROM privacy_deletion_queue AS queue
                               WHERE queue.request_id = audit.request_id)
             ORDER BY audit.purge_after, audit.request_id LIMIT $2
             FOR UPDATE OF audit SKIP LOCKED
           )
           DELETE FROM privacy_request_audit AS audit
           USING doomed
           WHERE audit.request_id = doomed.request_id
             AND audit.purge_after <= $1
             AND (
               audit.state IN ('complete', 'failed') OR
               (audit.request_type = 'export' AND audit.state = 'received')
             )
             AND NOT EXISTS (
               SELECT 1 FROM privacy_deletion_queue AS queue
               WHERE queue.request_id = audit.request_id
             )`,
          [at, limit],
        );
        counts.privacyAudits = audits.rowCount;
        return counts;
      } catch (error) {
        throw normalizePrivacyStoreError(error);
      }
    },

    database,
    providerMode,
  };
}

export function normalizePrimaryEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function decodeHmacKey(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{43,180}$/.test(text)) {
    throw new Error("PRIVACY_ARCHIVE_HMAC_KEY must be base64url with at least 32 random bytes.");
  }
  let bytes;
  try {
    bytes = Buffer.from(text, "base64url");
  } catch {
    bytes = Buffer.alloc(0);
  }
  if (bytes.length < 32) {
    throw new Error("PRIVACY_ARCHIVE_HMAC_KEY must contain at least 32 random bytes.");
  }
  return bytes;
}

async function deleteBatch(database, selector, table, key, values, extraWhere = "") {
  const quotedTable = table.split(".").map(quoteIdentifier).join(".");
  const quotedKey = quoteIdentifier(key);
  const extra = extraWhere ? ` AND ${extraWhere}` : "";
  const result = await database.query(
    `WITH doomed AS (${selector})
     DELETE FROM ${quotedTable} AS target
     USING doomed
     WHERE target.${quotedKey} = doomed.${quotedKey}${extra}`,
    values,
  );
  return result.rowCount;
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unsafe SQL identifier.");
  return `"${value}"`;
}

function addUtcYears(date, years) {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

function laterDate(first, second) {
  if (!first) return second;
  if (!second) return first;
  return first.getTime() >= second.getTime() ? first : second;
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function finiteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeCurrency(value) {
  const normalized = String(value || "").toLowerCase();
  return /^[a-z]{3}$/.test(normalized) ? normalized : null;
}

function safeToken(value) {
  const token = String(value || "").toLowerCase();
  return /^[a-z][a-z0-9_]{0,63}$/.test(token) ? token : null;
}

function safeStatus(value) {
  const status = String(value || "").toLowerCase();
  return /^[a-z][a-z0-9_]{0,127}$/.test(status) ? status : "unknown";
}

function safeErrorCode(value) {
  const code = String(value || "");
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "PRIVACY_OPERATION_FAILED";
}

function requireUserId(value) {
  if (!/^user_[A-Za-z0-9]{5,100}$/.test(String(value || ""))) {
    throw privacyStoreError("Account identifier is invalid.", "PRIVACY_USER_INVALID", 400);
  }
}

function privacyStoreError(message, code, status = 503) {
  return Object.assign(new Error(message), { status, code });
}

function normalizePrivacyStoreError(error) {
  if (error?.code && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) return error;
  const normalized = privacyStoreError(
    "Privacy storage is temporarily unavailable.",
    "PRIVACY_DATABASE_UNAVAILABLE",
  );
  normalized.databaseCode = /^[A-Z0-9]{5}$/.test(String(error?.code || ""))
    ? error.code
    : undefined;
  return normalized;
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {}
}
