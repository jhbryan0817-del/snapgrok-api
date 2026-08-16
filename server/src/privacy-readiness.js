import { randomUUID } from "node:crypto";

const REQUIRED_TABLE_COLUMNS = Object.freeze({
  "public.billing_usage_periods": [
    "clerk_user_id", "period_key", "plan_id", "allowance", "consumed",
    "reserved", "starts_at", "ends_at",
  ],
  "public.billing_analysis_usage": [
    "clerk_user_id", "operation_id", "usage_period_id", "plan_id",
    "model_id", "state", "created_at", "settled_at",
  ],
  "public.billing_checkout_sessions": [
    "id", "clerk_user_id", "requested_plan", "provider", "provider_mode",
    "company_id", "product_id", "plan_id", "status",
    "provider_checkout_id", "checkout_url", "expires_at", "created_at",
    "updated_at", "consumed_at",
  ],
  "public.billing_memberships": [
    "clerk_user_id", "provider", "provider_mode", "provider_membership_id",
    "checkout_configuration_id", "company_id", "product_id", "plan_id",
    "plan_code", "provider_status", "access_state", "renewal_period_start",
    "renewal_period_end", "cancel_at_period_end", "canceled_at",
    "provider_created_at", "provider_updated_at", "period_started_at",
    "state_changed_at",
  ],
  "public.billing_payment_history": [
    "clerk_user_id", "provider_mode", "provider_payment_id",
    "provider_membership_id", "provider_checkout_id", "company_id",
    "product_id", "plan_id", "plan_code", "display_status",
    "provider_substatus", "settlement_amount", "currency", "tax_amount",
    "tax_behavior", "billing_reason", "paid_at", "refunded_at",
    "disputed_at", "provider_created_at", "provider_updated_at",
    "archived_at", "updated_at",
  ],
  "public.billing_provider_events": [
    "provider", "provider_mode", "delivery_id", "resource_id", "received_at",
  ],
  "public.extension_device_sessions": [
    "clerk_user_id", "extension_id", "issued_at", "access_expires_at",
    "refresh_expires_at", "revoked_at", "last_seen_at",
  ],
  "public.extension_pairing_grants": [
    "clerk_user_id", "extension_id", "expires_at", "consumed_at", "created_at",
  ],
  "public.privacy_request_audit": [
    "request_id", "subject_hmac", "request_type", "state", "received_at",
    "completed_at", "exception_code", "purge_after", "created_at", "updated_at",
  ],
  "public.privacy_subject_index": [
    "clerk_user_id", "subject_lookup_hmac", "former_account_hmac",
    "hmac_key_version", "created_at", "updated_at",
  ],
  "public.privacy_deletion_queue": [
    "request_id", "clerk_user_id", "state", "identity_loaded",
    "archive_complete", "provider_cancellation_complete",
    "local_deletion_complete", "clerk_deletion_started", "attempt_count",
    "next_retry_at", "last_error_code", "created_at", "updated_at",
  ],
  "public.privacy_deletion_membership_retries": [
    "request_id", "provider_mode", "provider_membership_id", "created_at",
  ],
  "public.runtime_safety_latches": [
    "latch_name", "state", "consecutive_failures", "disabled_at",
    "last_failure_at", "last_success_at", "updated_at",
  ],
  "public.billing_checkout_tombstones": [
    "provider_mode", "provider_checkout_id", "company_id", "product_id",
    "plan_id", "plan_code", "prior_membership_ids", "provider_membership_id",
    "termination_state", "termination_attempted_at",
    "termination_confirmed_at", "provider_updated_at", "created_at",
  ],
  "legal_retention.transaction_records": [
    "record_id", "record_category", "subject_lookup_hmac",
    "former_account_hmac", "hmac_key_version", "provider", "provider_mode",
    "company_id", "provider_checkout_id", "provider_membership_id",
    "provider_payment_id", "product_id", "plan_id", "plan_code",
    "settlement_amount", "currency", "tax_amount", "tax_behavior",
    "billing_reason", "status", "provider_updated_at", "contracted_at",
    "paid_at", "canceled_at", "refunded_at", "disputed_at",
    "retention_basis", "retention_expires_at", "created_at", "updated_at",
  ],
});

const REQUIRED_TABLES = Object.freeze(Object.keys(REQUIRED_TABLE_COLUMNS));

export async function inspectPrivacyRuntimeReadiness(
  client,
  { mutationProbe = true, randomUUIDFn = randomUUID } = {},
) {
  if (!client || typeof client.query !== "function") {
    throw new Error("Privacy readiness requires a connected PostgreSQL client.");
  }

  try {
    const objects = await client.query(
      `SELECT object_name, to_regclass(object_name) IS NOT NULL AS present
       FROM unnest($1::text[]) AS required(object_name)
       ORDER BY object_name`,
      [REQUIRED_TABLES],
    );
    const missingTables = objects.rows
      .filter((row) => row.present !== true)
      .map((row) => String(row.object_name));
    if (missingTables.length > 0) {
      return failure("PRIVACY_DATABASE_NOT_MIGRATED", { missingTables });
    }

    const columns = await client.query(
      `SELECT required.table_name, required.column_name
       FROM jsonb_to_recordset($1::jsonb)
         AS required(table_name text, column_name text)
       LEFT JOIN information_schema.columns AS actual
         ON actual.table_schema = split_part(required.table_name, '.', 1)
        AND actual.table_name = split_part(required.table_name, '.', 2)
        AND actual.column_name = required.column_name
       WHERE actual.column_name IS NULL
       ORDER BY required.table_name, required.column_name`,
      [JSON.stringify(requiredColumns())],
    );
    const missingColumns = columns.rows.map(
      (row) => `${row.table_name}.${row.column_name}`,
    );
    if (missingColumns.length > 0) {
      return failure("PRIVACY_DATABASE_SCHEMA_MISMATCH", { missingColumns });
    }

    const privileges = await client.query(
      `WITH required(object_name) AS (SELECT unnest($1::text[]))
       SELECT object_name,
              has_table_privilege(current_user, object_name, 'SELECT') AS can_select,
              has_table_privilege(current_user, object_name, 'INSERT') AS can_insert,
              has_table_privilege(current_user, object_name, 'UPDATE') AS can_update,
              has_table_privilege(current_user, object_name, 'DELETE') AS can_delete
       FROM required
       ORDER BY object_name`,
      [REQUIRED_TABLES],
    );
    const schemas = await client.query(
      `SELECT
         has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage,
         has_schema_privilege(current_user, 'legal_retention', 'USAGE') AS archive_usage`,
    );
    const missingPrivileges = privileges.rows.flatMap((row) =>
      [
        ["SELECT", row.can_select],
        ["INSERT", row.can_insert],
        ["UPDATE", row.can_update],
        ["DELETE", row.can_delete],
      ]
        .filter(([, allowed]) => allowed !== true)
        .map(([privilege]) => `${row.object_name}:${privilege}`),
    );
    if (schemas.rows[0]?.public_usage !== true) {
      missingPrivileges.push("public:USAGE");
    }
    if (schemas.rows[0]?.archive_usage !== true) {
      missingPrivileges.push("legal_retention:USAGE");
    }
    if (missingPrivileges.length > 0) {
      return failure("PRIVACY_DATABASE_PRIVILEGES_MISSING", {
        missingPrivileges,
      });
    }

    if (mutationProbe) {
      const probe = await runMutationProbe(client, randomUUIDFn);
      if (!probe.ready) return probe;
    }

    return { ready: true, code: null, databaseCode: null };
  } catch (error) {
    return failure("PRIVACY_DATABASE_READINESS_FAILED", {
      databaseCode: safeDatabaseCode(error?.code),
    });
  }
}

async function runMutationProbe(client, randomUUIDFn) {
  const auditId = randomUUIDFn();
  const archiveId = randomUUIDFn();
  const subjectId = `privacy_readiness_${randomUUIDFn()}`;
  const zeroHmac = "0".repeat(64);
  const oneHmac = "1".repeat(64);
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      `INSERT INTO privacy_request_audit (
         request_id, subject_hmac, request_type, state, received_at, purge_after
       ) VALUES ($1, $2, 'export', 'received', now(), now() + interval '1 minute')`,
      [auditId, zeroHmac],
    );
    await client.query(
      `UPDATE privacy_request_audit
       SET state = $2,
           completed_at = CASE
             WHEN $2 IN ('complete', 'failed') THEN $4::timestamptz
             ELSE NULL
           END,
           exception_code = $3,
           purge_after = CASE
             WHEN $2 IN ('complete', 'failed')
             THEN $4::timestamptz + interval '1 year'
             ELSE purge_after
           END,
           updated_at = $4::timestamptz
       WHERE request_id = $1`,
      [auditId, "failed", "PRIVACY_READINESS_PROBE", new Date()],
    );
    await client.query(
      `INSERT INTO privacy_subject_index (
         clerk_user_id, subject_lookup_hmac, former_account_hmac, hmac_key_version
       ) VALUES ($1, $2, $3, 1)`,
      [subjectId, zeroHmac, oneHmac],
    );
    await client.query(
      `INSERT INTO legal_retention.transaction_records (
         record_id, record_category, subject_lookup_hmac,
         former_account_hmac, hmac_key_version, provider, provider_mode,
         provider_payment_id, retention_basis, retention_expires_at
       ) VALUES (
         $1, 'payment_supply', $2, $3, 1, 'whop', 'test', $4,
         'privacy readiness rollback probe', now() + interval '1 minute'
       )`,
      [archiveId, zeroHmac, oneHmac, `privacy_readiness_${archiveId}`],
    );
    await client.query(
      "UPDATE legal_retention.transaction_records SET status = 'probe' WHERE record_id = $1",
      [archiveId],
    );
    await client.query(
      "DELETE FROM legal_retention.transaction_records WHERE record_id = $1",
      [archiveId],
    );
    await client.query(
      "DELETE FROM privacy_subject_index WHERE clerk_user_id = $1",
      [subjectId],
    );
    await client.query(
      "DELETE FROM privacy_request_audit WHERE request_id = $1",
      [auditId],
    );
    await client.query("ROLLBACK");
    transactionOpen = false;
    return { ready: true, code: null, databaseCode: null };
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    return failure("PRIVACY_DATABASE_WRITE_PROBE_FAILED", {
      databaseCode: safeDatabaseCode(error?.code),
    });
  }
}

function requiredColumns() {
  return Object.entries(REQUIRED_TABLE_COLUMNS).flatMap(
    ([tableName, columns]) => columns.map((columnName) => ({
      table_name: tableName,
      column_name: columnName,
    })),
  );
}

function failure(code, details = {}) {
  return {
    ready: false,
    code,
    databaseCode: details.databaseCode || null,
    ...(details.missingTables?.length
      ? { missingTables: details.missingTables }
      : {}),
    ...(details.missingColumns?.length
      ? { missingColumns: details.missingColumns }
      : {}),
    ...(details.missingPrivileges?.length
      ? { missingPrivileges: details.missingPrivileges }
      : {}),
  };
}

function safeDatabaseCode(value) {
  const code = String(value || "");
  return /^[A-Z0-9]{5}$/.test(code) ? code : null;
}

export { REQUIRED_TABLE_COLUMNS };
