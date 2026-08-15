import pg from "pg";

const { Client } = pg;
const connectionString = String(
  process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || "",
).trim();

if (!connectionString) {
  throw new Error(
    "MIGRATION_DATABASE_URL or DATABASE_URL is required for the privacy preflight.",
  );
}

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  application_name: "zenaian-privacy-preflight",
});

const legacyTables = [
  "billing_checkout_intents",
  "billing_subscriptions",
  "billing_webhook_events",
];
const billingMode = String(process.env.BILLING_MODE || "")
  .trim()
  .toLowerCase();

try {
  await client.connect();
  const legacy = {};
  for (const table of legacyTables) {
    const exists = await client.query("SELECT to_regclass($1) AS table_name", [table]);
    if (!exists.rows[0]?.table_name) {
      legacy[table] = null;
      continue;
    }
    // Table names are fixed constants above, never input or environment data.
    const count = await client.query(`SELECT count(*)::integer AS count FROM ${table}`);
    legacy[table] = Number(count.rows[0]?.count || 0);
  }

  const migration = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'schema_migrations'
     ) AS has_ledger,
     to_regclass('legal_retention.transaction_records') AS archive_table,
     to_regclass('privacy_request_audit') AS audit_table,
     to_regclass('privacy_deletion_queue') AS deletion_queue,
     to_regclass('privacy_deletion_membership_retries') AS deletion_retries,
     to_regclass('billing_checkout_tombstones') AS checkout_tombstones`,
  );
  let privacyMigrationApplied = false;
  if (migration.rows[0]?.has_ledger) {
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = '006_privacy_compliance.sql'",
    );
    privacyMigrationApplied = applied.rowCount === 1;
  }

  const nonEmptyLegacyTables = Object.entries(legacy)
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([table, count]) => ({ table, count }));
  let activeForeignModeMemberships = null;
  const membershipsTable = await client.query(
    "SELECT to_regclass('billing_memberships') AS table_name",
  );
  if (
    membershipsTable.rows[0]?.table_name &&
    new Set(["test", "live"]).has(billingMode)
  ) {
    const foreignMode = await client.query(
      `SELECT count(*)::integer AS count
       FROM billing_memberships
       WHERE provider_mode <> $1
         AND access_state <> 'inactive'`,
      [billingMode],
    );
    activeForeignModeMemberships = Number(
      foreignMode.rows[0]?.count || 0,
    );
  }
  const result = {
    operation: "privacy_preflight",
    privacyMigrationApplied,
    privacyTablesPresent: Boolean(
      migration.rows[0]?.archive_table &&
      migration.rows[0]?.audit_table &&
      migration.rows[0]?.deletion_queue &&
      migration.rows[0]?.deletion_retries &&
      migration.rows[0]?.checkout_tombstones
    ),
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
    !result.safeToApplyPrivacyMigration ||
    !result.safeForConfiguredBillingMode
  ) {
    process.exitCode = 2;
  }
} finally {
  await client.end();
}
