import pg from "pg";
import { createDeletionLedgerStore } from "../src/deletion-ledger-store.js";

const { Pool } = pg;
const mode = String(process.argv[2] || "");
const userId = "user_RecoveryDrill00001";
const deviceSessionId = "30000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000002";
const completedAt = new Date("2026-09-15T00:00:00.000Z");

if (!new Set(["seed", "record", "verify"]).has(mode)) {
  throw new Error("Usage: node scripts/recovery-drill-fixture.js <seed|record|verify>");
}

if (mode === "record") {
  const ledger = createDeletionLedgerStore({
    connectionString: required("PRIVACY_DELETION_LEDGER_DATABASE_URL"),
    encryptionKey: required("PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY"),
    encryptionKeyVersion: Number(
      process.env.PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY_VERSION || 1,
    ),
  });
  try {
    await ledger.initialize();
    const inserted = await ledger.recordDeletion({ requestId, userId, completedAt });
    if (!inserted) throw new Error("Recovery-drill deletion receipt already exists.");
    console.log(JSON.stringify({ recoveryDrill: "ledger-receipt-recorded" }));
  } finally {
    await ledger.close();
  }
} else {
  const database = new Pool({
    connectionString: required("RECOVERY_DRILL_DATABASE_URL"),
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  try {
    if (mode === "seed") {
      await database.query(
        `INSERT INTO extension_device_sessions (
           id, clerk_user_id, clerk_session_id, extension_id,
           token_version, issued_at, access_expires_at, refresh_expires_at
         ) VALUES (
           $1, $2, 'sess_recovery_drill',
           'abcdefghijklmnopabcdefghijklmnop', 1,
           $3, $3::timestamptz + interval '15 minutes',
           $3::timestamptz + interval '30 days'
         )`,
        [deviceSessionId, userId, completedAt],
      );
      console.log(JSON.stringify({ recoveryDrill: "restore-fixture-seeded" }));
    } else {
      const result = await database.query(
        `SELECT
           (SELECT count(*)::integer FROM extension_device_sessions
            WHERE clerk_user_id = $1) AS device_rows,
           (SELECT count(*)::integer FROM privacy_request_audit
            WHERE request_id = $2 AND request_type = 'delete'
              AND state = 'complete') AS deletion_blocks`,
        [userId, requestId],
      );
      if (
        Number(result.rows[0]?.device_rows) !== 0 ||
        Number(result.rows[0]?.deletion_blocks) !== 1
      ) {
        throw new Error("Recovery drill did not remove restored data and reapply its block.");
      }
      console.log(JSON.stringify({
        recoveryDrill: "passed",
        restoredDeviceRows: 0,
        durableDeletionBlocks: 1,
      }));
    }
  } finally {
    await database.end();
  }
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
