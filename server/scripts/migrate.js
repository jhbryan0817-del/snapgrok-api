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
const connectionString = String(process.env.DATABASE_URL || "").trim();

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run billing migrations.");
}

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 10000,
  statement_timeout: 60000,
  application_name: "sneaksolve-migrations",
});

try {
  await client.connect();
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await client.query("SELECT pg_advisory_lock(439517, 1247816)");

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
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(439517, 1247816)");
  } catch {}
  await client.end();
}
