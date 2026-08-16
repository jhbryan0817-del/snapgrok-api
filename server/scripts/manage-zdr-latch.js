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

const action = String(process.argv[2] || "status").toLowerCase();
if (!new Set(["status", "reset"]).has(action)) {
  throw new Error("Usage: node scripts/manage-zdr-latch.js status|reset [--confirm=RESET_XAI_ZDR_LATCH]");
}
if (
  action === "reset" &&
  !process.argv.includes("--confirm=RESET_XAI_ZDR_LATCH")
) {
  throw new Error(
    "Reset requires --confirm=RESET_XAI_ZDR_LATCH after xAI ZDR evidence is re-verified.",
  );
}

const connectionString = String(process.env.DATABASE_URL || "").trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 10000,
  statement_timeout: 10000,
  application_name: "zenaian-zdr-latch-operator",
});

try {
  await client.connect();
  const result = action === "reset"
    ? await client.query(
        `UPDATE runtime_safety_latches
         SET state = 'enabled', consecutive_failures = 0,
             disabled_at = NULL, updated_at = now()
         WHERE latch_name = 'xai_zdr'
         RETURNING state, consecutive_failures, disabled_at,
                   last_failure_at, last_success_at, updated_at`,
      )
    : await client.query(
        `SELECT state, consecutive_failures, disabled_at,
                last_failure_at, last_success_at, updated_at
         FROM runtime_safety_latches
         WHERE latch_name = 'xai_zdr'`,
      );
  if (!result.rows[0]) {
    throw new Error("The xAI ZDR safety latch is missing; run migrations first.");
  }
  console.log(JSON.stringify({ latch: "xai_zdr", ...result.rows[0] }, null, 2));
} finally {
  await client.end();
}
