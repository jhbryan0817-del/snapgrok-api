import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
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
      if (sql.startsWith("SELECT ledger_sequence, request_id, encryption_key_version")) {
        return {
          rows: [{
            ledger_sequence: "1",
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

test("deletion retries remain idempotent after encryption-key rotation", async () => {
  let stored = null;
  const pool = {
    async query(text, parameters) {
      const sql = String(text).replace(/\s+/g, " ").trim();
      if (sql.startsWith("INSERT INTO completed_deletion_ledger")) {
        if (!stored) {
          stored = parameters;
          return { rows: [{ request_id: REQUEST_ID }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
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
  const versionOne = createDeletionLedgerStore({
    pool,
    encryptionKey: KEY,
    encryptionKeyVersion: 1,
    randomBytesFn: () => Buffer.alloc(12, 4),
  });
  await versionOne.recordDeletion({
    requestId: REQUEST_ID,
    userId: USER_ID,
    completedAt: NOW,
  });

  const versionTwo = createDeletionLedgerStore({
    pool,
    encryptionKey: Buffer.alloc(32, 7).toString("base64url"),
    encryptionKeyVersion: 2,
    previousEncryptionKeys: [{ version: 1, key: KEY }],
    randomBytesFn: () => Buffer.alloc(12, 5),
  });
  assert.equal(await versionTwo.recordDeletion({
    requestId: REQUEST_ID,
    userId: USER_ID,
    completedAt: NOW,
  }), false);
});

test("ledger pages use a stable time-and-sequence cursor", async () => {
  const queries = [];
  const pool = {
    async query(text, parameters) {
      queries.push([String(text).replace(/\s+/g, " ").trim(), parameters]);
      return {
        rows: [
          encryptedRow({ sequence: "10", requestId: REQUEST_ID }),
          encryptedRow({
            sequence: "11",
            requestId: "22222222-2222-4222-8222-222222222222",
          }),
        ],
        rowCount: 2,
      };
    },
  };
  const ledger = createDeletionLedgerStore({
    pool,
    encryptionKey: KEY,
    encryptionKeyVersion: 1,
  });
  const page = await ledger.listCompletedPage({
    after: new Date("2026-08-15T00:00:00.000Z"),
    limit: 1,
  });
  assert.equal(page.entries.length, 1);
  assert.deepEqual(page.nextCursor, {
    completedAt: NOW.toISOString(),
    sequence: "10",
  });
  assert.match(queries[0][0], /\(completed_at, ledger_sequence\) >/);
  assert.equal(queries[0][1][3], 2);
});

test("retention purge markers are appended and paginated", async () => {
  const markerId = "33333333-3333-4333-8333-333333333333";
  const cutoff = new Date("2026-08-15T12:00:00.000Z");
  let inserted = null;
  const pool = {
    async query(text, parameters) {
      const sql = String(text).replace(/\s+/g, " ").trim();
      if (sql.startsWith("INSERT INTO completed_retention_purge_ledger")) {
        inserted = parameters;
        return { rows: [{ marker_id: markerId }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT ledger_sequence, marker_id")) {
        return {
          rows: [{
            ledger_sequence: "1",
            marker_id: markerId,
            purge_cutoff_at: cutoff,
            completed_at: NOW,
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
  });
  assert.equal(await ledger.recordRetentionPurge({
    markerId,
    purgeCutoffAt: cutoff,
    completedAt: NOW,
  }), true);
  assert.ok(new Date(inserted[3]).getTime() > NOW.getTime());
  const page = await ledger.listRetentionPurgePage({
    after: new Date("2026-08-14T00:00:00.000Z"),
  });
  assert.deepEqual(page.entries, [{
    markerId,
    purgeCutoffAt: cutoff,
    completedAt: NOW,
  }]);
});

test("ledger migration rejects update and delete operations", async () => {
  const migration = `${await readFile(
    new URL("../deletion-ledger-migrations/001_completed_deletions.sql", import.meta.url),
    "utf8",
  )}\n${await readFile(
    new URL("../deletion-ledger-migrations/002_retention_purge_recovery.sql", import.meta.url),
    "utf8",
  )}`.replace(/\s+/g, " ");
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /COMPLETED_DELETION_LEDGER_APPEND_ONLY/);
  assert.match(migration, /interval '400 days'/);
  assert.match(migration, /completed_retention_purge_ledger/);
  assert.match(migration, /REVOKE ALL ON FUNCTION purge_expired_privacy_ledger/);
});

function encryptedRow({ sequence, requestId }) {
  const nonce = Buffer.alloc(12, 4);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(KEY, "base64url"), nonce);
  cipher.setAAD(Buffer.from(`${requestId}:1`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(USER_ID, "utf8"), cipher.final()]);
  return {
    ledger_sequence: sequence,
    request_id: requestId,
    encryption_key_version: 1,
    user_id_ciphertext: ciphertext,
    encryption_nonce: nonce,
    encryption_auth_tag: cipher.getAuthTag(),
    completed_at: NOW,
  };
}
