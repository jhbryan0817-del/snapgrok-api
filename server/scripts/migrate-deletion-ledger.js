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
const bootstrapRuntimeRole = strictBoolean(
  process.env.MIGRATION_BOOTSTRAP_RUNTIME_ROLES,
  false,
  "MIGRATION_BOOTSTRAP_RUNTIME_ROLES",
);

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
  const effectiveMigrationRole = await assertMigrationIdentity(
    client,
    migrationTarget.username,
  );
  await ensureRuntimeRole(client, {
    runtimeUrl,
    runtimeRole,
    bootstrapRuntimeRole,
  });
  await assertRuntimeRole(client, runtimeRole, effectiveMigrationRole);
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
  await assertRuntimeRole(client, runtimeRole, effectiveMigrationRole);
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

async function assertMigrationIdentity(client, migrationRole) {
  const identity = await client.query(
    `SELECT current_user AS current_user, session_user AS session_user,
            current_user = $1 AS current_matches_url,
            session_user = $1 AS session_matches_url,
            pg_has_role(session_user, current_user, 'MEMBER')
              AS session_member_of_current,
            EXISTS (
              SELECT 1 FROM pg_database
              WHERE datname = current_database()
                AND datdba = (
                  SELECT oid FROM pg_roles WHERE rolname = current_user
                )
            ) AS current_owns_database`,
    [migrationRole],
  );
  const role = identity.rows[0];
  const authenticatedOwner = role?.session_matches_url &&
    role?.current_owns_database &&
    (role?.current_matches_url || role?.session_member_of_current);
  if (!authenticatedOwner) {
    throw new Error(
      "The ledger migration URL must authenticate as its URL username and resolve only to the database owner.",
    );
  }
  return String(role.current_user);
}

async function ensureRuntimeRole(client, {
  runtimeUrl,
  runtimeRole,
  bootstrapRuntimeRole,
}) {
  const existing = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [runtimeRole],
  );
  if (existing.rowCount) return;
  if (!bootstrapRuntimeRole) {
    throw new Error(
      "The ledger runtime role must already exist unless the one-time runtime-role bootstrap is enabled.",
    );
  }
  const runtime = new URL(runtimeUrl);
  const password = decodeURIComponent(runtime.password);
  if (password.length < 32 || password.length > 256 || /[\u0000\r\n]/.test(password)) {
    throw new Error(
      "The ledger runtime URL must contain a strong runtime-role password.",
    );
  }
  const command = await client.query(
    `SELECT format(
       'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
       $1::text, $2::text
     ) AS statement`,
    [runtimeRole, password],
  );
  await client.query(command.rows[0].statement);
  console.log(`Created isolated ledger runtime role ${runtimeRole}.`);
}

function strictBoolean(value, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be exactly true or false.`);
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
