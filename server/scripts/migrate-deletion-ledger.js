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
  await client.query(`REVOKE ALL ON completed_deletion_ledger FROM ${role}`);
  await client.query(`GRANT SELECT, INSERT ON completed_deletion_ledger TO ${role}`);
  await client.query(`GRANT USAGE, SELECT ON SEQUENCE completed_deletion_ledger_ledger_sequence_seq TO ${role}`);
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
