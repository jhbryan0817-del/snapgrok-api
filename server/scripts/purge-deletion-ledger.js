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

if (!process.argv.includes("--confirm=PURGE_EXPIRED_PRIVACY_LEDGER")) {
  throw new Error(
    "Refusing to purge without --confirm=PURGE_EXPIRED_PRIVACY_LEDGER.",
  );
}
const beforeValue = process.argv.find((value) => value.startsWith("--before="))
  ?.slice("--before=".length);
const before = beforeValue ? new Date(beforeValue) : new Date();
if (!Number.isFinite(before.getTime()) || before.getTime() > Date.now()) {
  throw new Error("--before must be a valid timestamp that is not in the future.");
}
const migrationUrl = String(
  process.env.PRIVACY_DELETION_LEDGER_MIGRATION_DATABASE_URL || "",
).trim();
if (!migrationUrl) {
  throw new Error("PRIVACY_DELETION_LEDGER_MIGRATION_DATABASE_URL is required.");
}

const client = new Client({
  connectionString: migrationUrl,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 60_000,
  application_name: "zenaian-deletion-ledger-retention",
});
try {
  await client.connect();
  const result = await client.query(
    "SELECT * FROM purge_expired_privacy_ledger($1)",
    [before],
  );
  console.log(JSON.stringify({
    operation: "purge_expired_privacy_ledger",
    before: before.toISOString(),
    completedDeletions: Number(result.rows[0]?.completed_deletions || 0),
    retentionPurgeMarkers: Number(
      result.rows[0]?.retention_purge_markers || 0,
    ),
  }));
} finally {
  await client.end();
}
