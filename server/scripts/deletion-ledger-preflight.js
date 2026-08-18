import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createDeletionLedgerStore } from "../src/deletion-ledger-store.js";
import { loadEnv } from "../src/env.js";

const { Client } = pg;
const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
loadEnv(path.join(projectDirectory, ".env"));

const migrationUrl = required(
  "PRIVACY_DELETION_LEDGER_MIGRATION_DATABASE_URL",
);
const runtimeUrl = required("PRIVACY_DELETION_LEDGER_DATABASE_URL");
const mainUrl = required("DATABASE_URL");
const runtimeRole = required("PRIVACY_DELETION_LEDGER_RUNTIME_ROLE");
const migrationIdentity = postgresIdentity(migrationUrl);
const runtimeIdentity = postgresIdentity(runtimeUrl);
const mainIdentity = postgresIdentity(mainUrl);
if (
  migrationIdentity.host !== runtimeIdentity.host ||
  migrationIdentity.database !== runtimeIdentity.database ||
  migrationIdentity.username === runtimeIdentity.username ||
  runtimeIdentity.username !== runtimeRole
) {
  throw new Error("Ledger owner/runtime database identity is invalid.");
}
if (
  mainIdentity.host === runtimeIdentity.host &&
  mainIdentity.database === runtimeIdentity.database
) {
  throw new Error("The deletion ledger is not outside the main restore boundary.");
}

const ledger = createDeletionLedgerStore({
  connectionString: runtimeUrl,
  encryptionKey: required("PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY"),
  encryptionKeyVersion: Number(
    process.env.PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY_VERSION || 1,
  ),
  previousEncryptionKeys: parseVersionedKeys(
    process.env.PRIVACY_DELETION_LEDGER_PREVIOUS_ENCRYPTION_KEYS,
  ),
});
const owner = new Client({
  connectionString: migrationUrl,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  application_name: "zenaian-deletion-ledger-preflight",
});

try {
  await ledger.initialize();
  await owner.connect();
  const result = await owner.query(
    `SELECT
       (SELECT count(*)::integer FROM completed_deletion_ledger) AS deletions,
       (SELECT count(*)::integer FROM completed_retention_purge_ledger) AS retention_markers,
       has_database_privilege($1, current_database(), 'CREATE') AS can_create_database_object,
       has_database_privilege($1, current_database(), 'TEMP') AS can_create_temp,
       has_schema_privilege($1, 'public', 'CREATE') AS can_create_schema_object,
       has_function_privilege(
         $1,
         'purge_expired_privacy_ledger(timestamp with time zone)',
         'EXECUTE'
       ) AS can_purge`,
    [runtimeRole],
  );
  const state = result.rows[0] || {};
  if (
    state.can_create_database_object || state.can_create_temp ||
    state.can_create_schema_object || state.can_purge
  ) {
    throw new Error("Deletion-ledger runtime privilege boundary is unsafe.");
  }
  console.log(JSON.stringify({
    operation: "deletion_ledger_preflight",
    ready: true,
    separateRestoreBoundary: true,
    runtimeRoleIsolated: true,
    completedDeletionCount: Number(state.deletions || 0),
    retentionPurgeMarkerCount: Number(state.retention_markers || 0),
  }));
} finally {
  await Promise.allSettled([ledger.close(), owner.end()]);
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function postgresIdentity(value) {
  const url = new URL(value);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("Database URL must use PostgreSQL.");
  }
  return {
    host: `${url.hostname}:${url.port || "5432"}`,
    database: url.pathname,
    username: decodeURIComponent(url.username),
  };
}

function parseVersionedKeys(value) {
  return String(value || "").split(",").map((item) => item.trim())
    .filter(Boolean).map((item) => {
      const [version, key] = item.split(":", 2);
      if (!/^\d+$/.test(version || "") || !key) {
        throw new Error("Previous key entries must use version:base64url.");
      }
      return { version: Number(version), key };
    });
}
