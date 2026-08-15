import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDirectory = path.join(projectDirectory, "migrations");
// Production deliberately separates the DDL owner used here from the
// least-privilege role used by the long-running API.
const connectionString = String(
  process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || "",
).trim();
const runtimeConnectionString = String(process.env.DATABASE_URL || "").trim();
const configuredRuntimeRole = String(
  process.env.DATABASE_RUNTIME_ROLE || "",
).trim();
const productionRuntime =
  String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
const requireLeastPrivilege = productionRuntime || strictBoolean(
  process.env.REQUIRE_DATABASE_LEAST_PRIVILEGE,
  false,
  "REQUIRE_DATABASE_LEAST_PRIVILEGE",
);

if (!connectionString) {
  throw new Error(
    "MIGRATION_DATABASE_URL or DATABASE_URL is required to run Zenaian migrations.",
  );
}

const databaseBoundary = validateDatabaseBoundary({
  migrationConnectionString: connectionString,
  runtimeConnectionString,
  configuredRuntimeRole,
  required: requireLeastPrivilege,
});

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 10000,
  statement_timeout: 60000,
  application_name: "zenaian-migrations",
});

try {
  await client.connect();
  if (databaseBoundary) {
    await assertMigrationIdentity(client, databaseBoundary.migrationRole);
    await assertRuntimeRole(
      client,
      databaseBoundary.runtimeRole,
      databaseBoundary.migrationRole,
    );
  }
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  // Stable provider-neutral lock key: ASCII "SNEK" / "MIGR".
  await client.query("SELECT pg_advisory_lock(1397638475, 1296648018)");

  const filenames = (await fs.readdir(migrationsDirectory))
    .filter((filename) => /^\d{3}_[a-z0-9_]+\.sql$/.test(filename))
    .sort();

  for (const filename of filenames) {
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = $1",
      [filename],
    );
    if (applied.rowCount) continue;

    const sql = await fs.readFile(
      path.join(migrationsDirectory, filename),
      "utf8",
    );
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [filename],
      );
      await client.query("COMMIT");
      console.log(`Applied migration ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  if (productionRuntime) {
    await assertNoForeignModeActiveMemberships(
      client,
      String(process.env.BILLING_MODE || "").trim().toLowerCase(),
    );
  }

  if (databaseBoundary) {
    await assertRuntimeRole(
      client,
      databaseBoundary.runtimeRole,
      databaseBoundary.migrationRole,
    );
    await applyRuntimePrivileges(client, databaseBoundary.runtimeRole);
    await verifyRuntimePrivileges(client, databaseBoundary.runtimeRole);
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(1397638475, 1296648018)");
  } catch {}
  await client.end();
}

async function assertNoForeignModeActiveMemberships(client, billingMode) {
  if (!new Set(["test", "live"]).has(billingMode)) {
    throw new Error(
      "Production privacy validation requires BILLING_MODE=test or BILLING_MODE=live.",
    );
  }
  const result = await client.query(
    `SELECT count(*)::integer AS count
     FROM billing_memberships
     WHERE provider_mode <> $1
       AND access_state <> 'inactive'`,
    [billingMode],
  );
  const count = Number(result.rows[0]?.count || 0);
  if (count > 0) {
    throw new Error(
      `Production privacy validation found ${count} active membership(s) from another Whop mode. Terminate and reconcile them with that mode's credentials before launch.`,
    );
  }
}

async function assertMigrationIdentity(client, migrationRole) {
  const identity = await client.query(
    "SELECT current_user AS current_user, session_user AS session_user",
  );
  if (
    identity.rows[0]?.current_user !== migrationRole ||
    identity.rows[0]?.session_user !== migrationRole
  ) {
    throw new Error(
      "MIGRATION_DATABASE_URL must connect directly as its declared migration-owner username without role remapping.",
    );
  }
}

function validateDatabaseBoundary({
  migrationConnectionString,
  runtimeConnectionString,
  configuredRuntimeRole,
  required,
}) {
  if (!required && !configuredRuntimeRole) return null;
  if (!runtimeConnectionString || !process.env.MIGRATION_DATABASE_URL) {
    throw new Error(
      "Production database isolation requires both DATABASE_URL and MIGRATION_DATABASE_URL.",
    );
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(configuredRuntimeRole)) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE must be a simple PostgreSQL role name.",
    );
  }
  const migration = parsePostgresUrl(migrationConnectionString, "MIGRATION_DATABASE_URL");
  const runtime = parsePostgresUrl(runtimeConnectionString, "DATABASE_URL");
  if (
    migration.hostname !== runtime.hostname ||
    migration.port !== runtime.port ||
    migration.pathname !== runtime.pathname
  ) {
    throw new Error(
      "MIGRATION_DATABASE_URL and DATABASE_URL must target the same PostgreSQL database.",
    );
  }
  const migrationRole = decodeURIComponent(migration.username);
  const runtimeRole = decodeURIComponent(runtime.username);
  if (runtimeRole !== configuredRuntimeRole) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE must match the username embedded in DATABASE_URL.",
    );
  }
  if (migrationRole === runtimeRole) {
    throw new Error(
      "MIGRATION_DATABASE_URL must use a different DDL owner from DATABASE_URL.",
    );
  }
  return { runtimeRole, migrationRole };
}

function parsePostgresUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a PostgreSQL connection URL.`);
  }
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol) ||
    !parsed.username ||
    !parsed.hostname ||
    !parsed.pathname ||
    parsed.pathname === "/"
  ) {
    throw new Error(`${name} must be a complete PostgreSQL connection URL.`);
  }
  return parsed;
}

async function applyRuntimePrivileges(client, runtimeRole) {
  const role = quoteIdentifier(runtimeRole);
  const databaseName = String(
    (await client.query("SELECT current_database() AS name")).rows[0]?.name || "",
  );
  const database = quoteIdentifier(databaseName);

  await client.query("BEGIN");
  try {
    await client.query(
      "REVOKE CREATE ON SCHEMA public, legal_retention FROM PUBLIC",
    );
    await client.query(`REVOKE CREATE ON SCHEMA public, legal_retention FROM ${role}`);
    await client.query(`REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
    await client.query(
      `REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${role}`,
    );
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public, legal_retention TO ${role}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES
       IN SCHEMA public, legal_retention TO ${role}`,
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES
       IN SCHEMA public, legal_retention TO ${role}`,
    );
    await client.query(`REVOKE ALL ON TABLE public.schema_migrations FROM ${role}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public, legal_retention
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public, legal_retention
       GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function assertRuntimeRole(client, runtimeRole, migrationRole) {
  const roleState = await client.query(
    `SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls
     FROM pg_roles WHERE rolname = $1`,
    [runtimeRole],
  );
  const attributes = roleState.rows[0];
  if (!attributes || !attributes.rolcanlogin) {
    throw new Error("DATABASE_RUNTIME_ROLE must already exist and allow login.");
  }
  if (
    attributes.rolsuper || attributes.rolcreatedb || attributes.rolcreaterole ||
    attributes.rolreplication || attributes.rolbypassrls
  ) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE must not have superuser, database/role creation, replication, or row-security bypass privileges.",
    );
  }
  const unsafeMembership = await client.query(
    `SELECT pg_has_role($1, $2, 'MEMBER') AS member_of_migration_role`,
    [runtimeRole, migrationRole],
  );
  if (unsafeMembership.rows[0]?.member_of_migration_role) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE must not be a member of the migration-owner role.",
    );
  }
  const managedOwner = await client.query(
    `WITH managed_owners(owner_oid) AS (
       SELECT datdba FROM pg_database WHERE datname = current_database()
       UNION
       SELECT nspowner FROM pg_namespace WHERE nspname IN ('public', 'legal_retention')
       UNION
       SELECT class.relowner
       FROM pg_class AS class
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname IN ('public', 'legal_retention')
       UNION
       SELECT procedure.proowner
       FROM pg_proc AS procedure
       JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname IN ('public', 'legal_retention')
       UNION
       SELECT type.typowner
       FROM pg_type AS type
       JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
       WHERE namespace.nspname IN ('public', 'legal_retention')
     )
     SELECT role.rolname
     FROM managed_owners AS owner
     JOIN pg_roles AS role ON role.oid = owner.owner_oid
     WHERE pg_has_role($1, owner.owner_oid, 'MEMBER')
     LIMIT 1`,
    [runtimeRole],
  );
  if (managedOwner.rowCount) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE must not own or inherit ownership of the managed database, schemas, or objects.",
    );
  }
}

async function verifyRuntimePrivileges(client, runtimeRole) {
  const boundary = await client.query(
    `SELECT
       has_database_privilege($1, current_database(), 'CONNECT') AS can_connect,
       has_database_privilege($1, current_database(), 'CREATE') AS can_create_database_object,
       has_database_privilege($1, current_database(), 'TEMP') AS can_create_temp,
       has_schema_privilege($1, 'public', 'USAGE') AS public_usage,
       has_schema_privilege($1, 'public', 'CREATE') AS public_create,
       has_schema_privilege($1, 'legal_retention', 'USAGE') AS archive_usage,
       has_schema_privilege($1, 'legal_retention', 'CREATE') AS archive_create,
       has_table_privilege($1, 'public.schema_migrations', 'SELECT') OR
       has_table_privilege($1, 'public.schema_migrations', 'INSERT') OR
       has_table_privilege($1, 'public.schema_migrations', 'UPDATE') OR
       has_table_privilege($1, 'public.schema_migrations', 'DELETE')
         AS migration_ledger_access`,
    [runtimeRole],
  );
  const state = boundary.rows[0] || {};
  if (
    !state.can_connect || !state.public_usage || !state.archive_usage ||
    state.can_create_database_object || state.can_create_temp ||
    state.public_create || state.archive_create || state.migration_ledger_access
  ) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE privilege verification failed after migration.",
    );
  }
  const missingTables = await client.query(
    `SELECT class.oid::regclass::text AS object_name
     FROM pg_class AS class
     JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
     WHERE namespace.nspname IN ('public', 'legal_retention')
       AND class.relkind IN ('r', 'p')
       AND NOT (
         namespace.nspname = 'public' AND class.relname = 'schema_migrations'
       )
       AND NOT (
         has_table_privilege($1, class.oid, 'SELECT') AND
         has_table_privilege($1, class.oid, 'INSERT') AND
         has_table_privilege($1, class.oid, 'UPDATE') AND
         has_table_privilege($1, class.oid, 'DELETE')
       )
     LIMIT 1`,
    [runtimeRole],
  );
  if (missingTables.rowCount) {
    throw new Error(
      `DATABASE_RUNTIME_ROLE is missing required DML on ${missingTables.rows[0].object_name}.`,
    );
  }
}

function quoteIdentifier(value) {
  const identifier = String(value || "");
  if (!identifier || identifier.includes("\0")) {
    throw new Error("Unsafe PostgreSQL identifier.");
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function strictBoolean(value, fallback, name) {
  if (value == null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false.`);
}
