import pg from "pg";
import { inspectPrivacyRuntimeReadiness } from "../src/privacy-readiness.js";

const { Client } = pg;
const migrationConnectionString = String(
  process.env.MIGRATION_DATABASE_URL || "",
).trim();
const runtimeConnectionString = String(process.env.DATABASE_URL || "").trim();

if (!migrationConnectionString || !runtimeConnectionString) {
  throw new Error(
    "DATABASE_URL and the separate MIGRATION_DATABASE_URL are required for the privacy preflight.",
  );
}

const migrationClient = new Client({
  connectionString: migrationConnectionString,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  application_name: "zenaian-privacy-preflight-owner",
});
const runtimeClient = new Client({
  connectionString: runtimeConnectionString,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  application_name: "zenaian-privacy-preflight-runtime",
});

const legacyTables = [
  "billing_checkout_intents",
  "billing_subscriptions",
  "billing_webhook_events",
];
const billingMode = String(process.env.BILLING_MODE || "")
  .trim()
  .toLowerCase();
let migrationConnected = false;
let runtimeConnected = false;

try {
  await migrationClient.connect();
  migrationConnected = true;
  const legacy = {};
  for (const table of legacyTables) {
    const exists = await migrationClient.query(
      "SELECT to_regclass($1) AS table_name",
      [table],
    );
    if (!exists.rows[0]?.table_name) {
      legacy[table] = null;
      continue;
    }
    // Table names are fixed constants above, never input or environment data.
    const count = await migrationClient.query(
      `SELECT count(*)::integer AS count FROM ${table}`,
    );
    legacy[table] = Number(count.rows[0]?.count || 0);
  }

  const migration = await migrationClient.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'schema_migrations'
     ) AS has_ledger,
     to_regclass('legal_retention.transaction_records') AS archive_table,
     to_regclass('privacy_request_audit') AS audit_table,
     to_regclass('privacy_deletion_queue') AS deletion_queue,
     to_regclass('privacy_deletion_membership_retries') AS deletion_retries,
     to_regclass('privacy_subject_index') AS subject_index,
     to_regclass('billing_checkout_tombstones') AS checkout_tombstones,
     to_regclass('runtime_safety_latches') AS runtime_safety_latches`,
  );
  let privacyMigrationApplied = false;
  let runtimeSafetyMigrationApplied = false;
  if (migration.rows[0]?.has_ledger) {
    const applied = await migrationClient.query(
      `SELECT version FROM schema_migrations
       WHERE version = ANY($1::text[])`,
      [[
        "006_privacy_compliance.sql",
        "007_runtime_safety_latches.sql",
      ]],
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));
    privacyMigrationApplied = appliedVersions.has("006_privacy_compliance.sql");
    runtimeSafetyMigrationApplied = appliedVersions.has(
      "007_runtime_safety_latches.sql",
    );
  }

  const nonEmptyLegacyTables = Object.entries(legacy)
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([table, count]) => ({ table, count }));
  let activeForeignModeMemberships = null;
  const membershipsTable = await migrationClient.query(
    "SELECT to_regclass('billing_memberships') AS table_name",
  );
  if (
    membershipsTable.rows[0]?.table_name &&
    new Set(["test", "live"]).has(billingMode)
  ) {
    const foreignMode = await migrationClient.query(
      `SELECT count(*)::integer AS count
       FROM billing_memberships
       WHERE provider_mode <> $1
         AND access_state <> 'inactive'`,
      [billingMode],
    );
    activeForeignModeMemberships = Number(foreignMode.rows[0]?.count || 0);
  }

  let runtimeReadiness;
  try {
    await runtimeClient.connect();
    runtimeConnected = true;
    runtimeReadiness = await inspectPrivacyRuntimeReadiness(runtimeClient);
  } catch (error) {
    runtimeReadiness = {
      ready: false,
      code: "PRIVACY_DATABASE_CONNECTION_FAILED",
      databaseCode: safeDatabaseCode(error?.code),
    };
  }

  const result = {
    operation: "privacy_preflight",
    privacyMigrationApplied,
    runtimeSafetyMigrationApplied,
    privacyTablesPresent: Boolean(
      migration.rows[0]?.archive_table &&
      migration.rows[0]?.audit_table &&
      migration.rows[0]?.deletion_queue &&
      migration.rows[0]?.deletion_retries &&
      migration.rows[0]?.subject_index &&
      migration.rows[0]?.checkout_tombstones &&
      migration.rows[0]?.runtime_safety_latches
    ),
    privacyRuntimeReady: runtimeReadiness.ready,
    privacyRuntimeCode: runtimeReadiness.code,
    privacyRuntimeDatabaseCode: runtimeReadiness.databaseCode,
    ...(runtimeReadiness.missingTables
      ? { missingRuntimeTables: runtimeReadiness.missingTables }
      : {}),
    ...(runtimeReadiness.missingColumns
      ? { missingRuntimeColumns: runtimeReadiness.missingColumns }
      : {}),
    ...(runtimeReadiness.missingPrivileges
      ? { missingRuntimePrivileges: runtimeReadiness.missingPrivileges }
      : {}),
    legacyTableRowCounts: legacy,
    safeToApplyPrivacyMigration: nonEmptyLegacyTables.length === 0,
    nonEmptyLegacyTables,
    configuredBillingMode: billingMode || null,
    activeForeignModeMemberships,
    safeForConfiguredBillingMode:
      activeForeignModeMemberships == null ||
      activeForeignModeMemberships === 0,
  };
  console.log(JSON.stringify(result));
  if (
    !result.privacyMigrationApplied ||
    !result.runtimeSafetyMigrationApplied ||
    !result.privacyTablesPresent ||
    !result.privacyRuntimeReady ||
    !result.safeToApplyPrivacyMigration ||
    !result.safeForConfiguredBillingMode
  ) {
    process.exitCode = 2;
  }
} finally {
  if (runtimeConnected) await runtimeClient.end();
  if (migrationConnected) await migrationClient.end();
}

function safeDatabaseCode(value) {
  const code = String(value || "");
  return /^[A-Z0-9]{5}$/.test(code) ? code : null;
}
