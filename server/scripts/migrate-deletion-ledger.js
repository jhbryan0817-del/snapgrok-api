import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "../src/env.js";

const { Client } = pg;
const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
loadEnv(path.join(projectDirectory, ".env"));

const migrationUrl = String(
  process.env.PRIVACY_DELETION_LEDGER_MIGRATION_DATABASE_URL || "",
).trim();
const runtimeUrl = String(
  process.env.PRIVACY_DELETION_LEDGER_DATABASE_URL || "",
).trim();
const mainDatabaseUrl = String(process.env.DATABASE_URL || "").trim();
const runtimeRole = String(
  process.env.PRIVACY_DELETION_LEDGER_RUNTIME_ROLE || "",
).trim();

if (!migrationUrl || !runtimeUrl || !mainDatabaseUrl || !runtimeRole) {
  throw new Error(
    "Ledger migration requires its migration URL, runtime URL/role, and the main DATABASE_URL.",
  );
}
const migrationTarget = postgresIdentity(migrationUrl, "ledger migration URL");
const runtimeTarget = postgresIdentity(runtimeUrl, "ledger runtime URL");
const mainTarget = postgresIdentity(mainDatabaseUrl, "DATABASE_URL");
if (
  migrationTarget.host !== runtimeTarget.host ||
  migrationTarget.database !== runtimeTarget.database ||
  migrationTarget.username === runtimeTarget.username ||
  runtimeTarget.username !== runtimeRole
) {
  throw new Error(
    "Ledger migration/runtime URLs must target one database with distinct owner and runtime roles.",
  );
}
if (
  mainTarget.host === runtimeTarget.host &&
  mainTarget.database === runtimeTarget.database
) {
  throw new Error("The deletion ledger must use a database outside the main restore boundary.");
}

const client = new Client({
  connectionString: migrationUrl,
  connectionTimeoutMillis: 10000,
  statement_timeout: 60000,
  application_name: "zenaian-deletion-ledger-migrations",
});

try {
  await client.connect();
  const identity = await client.query(
    "SELECT current_user AS current_user, session_user AS session_user",
  );
  if (
    identity.rows[0]?.current_user !== migrationTarget.username ||
    identity.rows[0]?.session_user !== migrationTarget.username
  ) {
    throw new Error(
      "The ledger migration URL must connect directly as its declared owner.",
    );
  }
  await assertRuntimeRole(client, runtimeRole, migrationTarget.username);
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const migrationsDirectory = path.join(
    projectDirectory,
    "deletion-ledger-migrations",
  );
  const filenames = (await fs.readdir(migrationsDirectory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  for (const filename of filenames) {
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = $1",
      [filename],
    );
    if (applied.rowCount) continue;
    await client.query("BEGIN");
    try {
      await client.query(await fs.readFile(
        path.join(migrationsDirectory, filename),
        "utf8",
      ));
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [filename],
      );
      await client.query("COMMIT");
      console.log(`Applied deletion-ledger migration ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  const role = quoteIdentifier(runtimeRole);
  const databaseName = String(
    (await client.query("SELECT current_database() AS name")).rows[0]?.name || "",
  );
  const database = quoteIdentifier(databaseName);
  await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${role}`);
  await client.query(`REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
  await client.query(
    `REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${role}`,
  );
  await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  for (const table of [
    "completed_deletion_ledger",
    "completed_retention_purge_ledger",
  ]) {
    const identifier = quoteIdentifier(table);
    const sequence = quoteIdentifier(`${table}_ledger_sequence_seq`);
    await client.query(`REVOKE ALL ON ${identifier} FROM ${role}`);
    await client.query(`GRANT SELECT, INSERT ON ${identifier} TO ${role}`);
    await client.query(
      `GRANT USAGE, SELECT ON SEQUENCE ${sequence} TO ${role}`,
    );
  }
  await client.query(
    `REVOKE ALL ON FUNCTION purge_expired_privacy_ledger(timestamptz) FROM ${role}`,
  );
  await assertRuntimeRole(client, runtimeRole, migrationTarget.username);
} finally {
  await client.end();
}

function postgresIdentity(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} is invalid.`); }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error(`${name} must be PostgreSQL.`);
  }
  return {
    host: `${url.hostname}:${url.port || "5432"}`,
    database: url.pathname,
    username: decodeURIComponent(url.username),
  };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error("Ledger runtime role is invalid.");
  }
  return `"${value}"`;
}

async function assertRuntimeRole(client, runtimeRole, migrationRole) {
  const result = await client.query(
    `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
            rolreplication, rolbypassrls,
            pg_has_role($1, $2, 'MEMBER') AS member_of_migration_role
     FROM pg_roles WHERE rolname = $1`,
    [runtimeRole, migrationRole],
  );
  const role = result.rows[0];
  if (
    !role?.rolcanlogin || role.rolsuper || role.rolcreatedb ||
    role.rolcreaterole || role.rolreplication || role.rolbypassrls ||
    role.member_of_migration_role
  ) {
    throw new Error(
      "The ledger runtime role must be a non-admin login isolated from the migration owner.",
    );
  }
}
