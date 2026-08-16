import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDeletionLedgerStore } from "../src/deletion-ledger-store.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user_DeletionLedgerTest123";
const KEY = Buffer.alloc(32, 9).toString("base64url");
const NOW = new Date("2026-08-16T00:00:00.000Z");

test("external deletion ledger encrypts Clerk IDs and can replay them", async () => {
  let stored = null;
  const pool = {
    async query(text, parameters) {
      const sql = String(text).replace(/\s+/g, " ").trim();
      if (sql.startsWith("INSERT INTO completed_deletion_ledger")) {
        stored = parameters;
        return { rows: [{ request_id: REQUEST_ID }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT request_id, encryption_key_version")) {
        return {
          rows: [{
            request_id: stored[0],
            encryption_key_version: stored[2],
            user_id_ciphertext: stored[3],
            encryption_nonce: stored[4],
            encryption_auth_tag: stored[5],
            completed_at: stored[6],
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const ledger = createDeletionLedgerStore({
    pool,
    encryptionKey: KEY,
    encryptionKeyVersion: 1,
    randomBytesFn: () => Buffer.alloc(12, 4),
  });

  assert.equal(await ledger.recordDeletion({
    requestId: REQUEST_ID,
    userId: USER_ID,
    completedAt: NOW,
  }), true);
  assert.notEqual(Buffer.from(stored[3]).toString("utf8"), USER_ID);
  assert.doesNotMatch(stored[1], /DeletionLedgerTest/);
  assert.deepEqual(await ledger.listCompletedAfter(
    new Date("2026-08-15T00:00:00.000Z"),
  ), [{ requestId: REQUEST_ID, userId: USER_ID, completedAt: NOW }]);
});

test("ledger migration rejects update and delete operations", async () => {
  const migration = String(await readFile(
    new URL("../deletion-ledger-migrations/001_completed_deletions.sql", import.meta.url),
    "utf8",
  )).replace(/\s+/g, " ");
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /COMPLETED_DELETION_LEDGER_APPEND_ONLY/);
});
