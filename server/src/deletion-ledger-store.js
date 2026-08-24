import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import pg from "pg";
import { observePostgresPool } from "./postgres-runtime.js";

const { Pool } = pg;
const LEDGER_RETENTION_DAYS = 400;

export function createDeletionLedgerStore({
  connectionString,
  pool,
  encryptionKey,
  encryptionKeyVersion = 1,
  previousEncryptionKeys = [],
  poolMax = 2,
  connectionTimeoutMs = 5000,
  statementTimeoutMs = 10000,
  randomBytesFn = randomBytes,
}) {
  if (!pool && !connectionString) {
    throw new Error("PRIVACY_DELETION_LEDGER_DATABASE_URL is required.");
  }
  const keyring = new Map([
    [encryptionKeyVersion, decodeEncryptionKey(encryptionKey)],
    ...previousEncryptionKeys.map((entry) => [
      entry.version,
      decodeEncryptionKey(entry.key),
    ]),
  ]);
  if (
    !Number.isInteger(encryptionKeyVersion) || encryptionKeyVersion < 1 ||
    keyring.size !== previousEncryptionKeys.length + 1 ||
    [...keyring.keys()].some((version) =>
      !Number.isInteger(version) || version < 1)
  ) {
    throw new Error("Deletion-ledger encryption key versions must be unique positive integers.");
  }
  const currentKey = keyring.get(encryptionKeyVersion);
  const database = pool || new Pool({
    connectionString,
    max: Math.max(1, Math.min(4, poolMax)),
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
    application_name: "zenaian-deletion-ledger",
  });
  const ownsPool = !pool;
  if (ownsPool) observePostgresPool(database, "deletion-ledger");

  return {
    async initialize() {
      for (const table of [
        "completed_deletion_ledger",
        "completed_retention_purge_ledger",
      ]) {
        const result = await database.query(
          `SELECT to_regclass($1) IS NOT NULL AS present,
                has_table_privilege(
                  current_user,
                  $1,
                  'SELECT'
                ) AS can_select,
                has_table_privilege(
                  current_user,
                  $1,
                  'INSERT'
                ) AS can_insert,
                has_table_privilege(
                  current_user,
                  $1,
                  'UPDATE'
                ) AS can_update,
                has_table_privilege(
                  current_user,
                  $1,
                  'DELETE'
                ) AS can_delete`,
          [`public.${table}`],
        );
        const state = result.rows[0] || {};
        if (
          state.present !== true || state.can_select !== true ||
          state.can_insert !== true || state.can_update === true ||
          state.can_delete === true
        ) {
          throw new Error(
            "Deletion-ledger readiness requires SELECT/INSERT-only access to every external append-only table.",
          );
        }
      }
      const purgePrivilege = await database.query(
        `SELECT has_function_privilege(
           current_user,
           'public.purge_expired_privacy_ledger(timestamp with time zone)',
           'EXECUTE'
         ) AS can_purge`,
      );
      if (purgePrivilege.rows[0]?.can_purge === true) {
        throw new Error(
          "The deletion-ledger runtime role must not execute the controlled purge function.",
        );
      }
      const versions = await database.query(
        `SELECT DISTINCT encryption_key_version
         FROM completed_deletion_ledger
         WHERE purge_after > now()`,
      );
      const missingVersions = versions.rows
        .map((row) => Number(row.encryption_key_version))
        .filter((version) => !keyring.has(version));
      if (missingVersions.length) {
        throw new Error(
          `Deletion-ledger encryption key version ${missingVersions[0]} is unavailable.`,
        );
      }
    },

    async close() {
      if (ownsPool) await database.end();
    },

    async recordDeletion({ requestId, userId, completedAt = new Date() }) {
      requireRequestId(requestId);
      requireUserId(userId);
      const at = validDate(completedAt, "Deletion completion time is invalid.");
      const subjectHmac = createHmac("sha256", currentKey)
        .update(`zenaian-deletion-ledger:${userId}`, "utf8")
        .digest("hex");
      const nonce = randomBytesFn(12);
      if (!Buffer.isBuffer(nonce) || nonce.length !== 12) {
        throw new Error("Deletion ledger nonce generation failed.");
      }
      const cipher = createCipheriv("aes-256-gcm", currentKey, nonce);
      cipher.setAAD(aad(requestId, encryptionKeyVersion));
      const ciphertext = Buffer.concat([
        cipher.update(userId, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      const inserted = await database.query(
        `INSERT INTO completed_deletion_ledger (
           request_id, subject_hmac, encryption_key_version,
           user_id_ciphertext, encryption_nonce, encryption_auth_tag,
           completed_at, purge_after
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING request_id`,
        [
          requestId,
          subjectHmac,
          encryptionKeyVersion,
          ciphertext,
          nonce,
          authTag,
          at,
          retentionDate(at),
        ],
      );
      if (inserted.rowCount === 1) return true;
      const existing = await database.query(
        `SELECT request_id, encryption_key_version, user_id_ciphertext,
                encryption_nonce, encryption_auth_tag, completed_at
         FROM completed_deletion_ledger
         WHERE request_id = $1`,
        [requestId],
      );
      const existingDeletion = existing.rows[0]
        ? decryptLedgerRow(existing.rows[0], keyring)
        : null;
      if (existingDeletion?.userId !== userId) {
        throw new Error("Deletion ledger request identity conflict.");
      }
      return false;
    },

    async listCompletedAfter(after, limit = 500) {
      return (await this.listCompletedPage({ after, limit })).entries;
    },

    async listCompletedPage({ after, cursor = null, limit = 500 }) {
      const afterDate = validDate(after, "Restore point is invalid.");
      const bounded = Math.max(
        1,
        Math.min(5000, Number.isSafeInteger(limit) ? limit : 500),
      );
      const pageCursor = validCursor(cursor);
      const result = await database.query(
        `SELECT ledger_sequence, request_id, encryption_key_version, user_id_ciphertext,
                encryption_nonce, encryption_auth_tag, completed_at
         FROM completed_deletion_ledger
         WHERE completed_at > $1
           AND (
             $2::timestamptz IS NULL OR
             (completed_at, ledger_sequence) > ($2::timestamptz, $3::bigint)
           )
         ORDER BY completed_at, ledger_sequence
         LIMIT $4`,
        [
          afterDate,
          pageCursor?.completedAt || null,
          pageCursor?.sequence || null,
          bounded + 1,
        ],
      );
      const pageRows = result.rows.slice(0, bounded);
      const last = pageRows.at(-1);
      return {
        entries: pageRows.map((row) => decryptLedgerRow(row, keyring)),
        nextCursor: result.rows.length > bounded && last
          ? {
              completedAt: validDate(
                last.completed_at,
                "Ledger completion time is invalid.",
              ).toISOString(),
              sequence: String(last.ledger_sequence),
            }
          : null,
      };
    },

    async recordRetentionPurge({
      markerId,
      purgeCutoffAt,
      completedAt = new Date(),
    }) {
      requireRequestId(markerId);
      const cutoff = validDate(purgeCutoffAt, "Retention-purge cutoff is invalid.");
      const completed = validDate(completedAt, "Retention-purge completion time is invalid.");
      if (cutoff.getTime() > completed.getTime()) {
        throw new Error("Retention-purge cutoff cannot be after completion.");
      }
      const inserted = await database.query(
        `INSERT INTO completed_retention_purge_ledger (
           marker_id, purge_cutoff_at, completed_at, purge_after
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (marker_id) DO NOTHING
         RETURNING marker_id`,
        [markerId, cutoff, completed, retentionDate(completed)],
      );
      if (inserted.rowCount === 1) return true;
      const existing = await database.query(
        `SELECT purge_cutoff_at, completed_at
         FROM completed_retention_purge_ledger
         WHERE marker_id = $1`,
        [markerId],
      );
      const row = existing.rows[0];
      if (
        !row ||
        validDate(row.purge_cutoff_at, "Retention marker is invalid.").getTime() !== cutoff.getTime() ||
        validDate(row.completed_at, "Retention marker is invalid.").getTime() !== completed.getTime()
      ) {
        throw new Error("Retention-purge ledger marker conflict.");
      }
      return false;
    },

    async listRetentionPurgePage({ after, cursor = null, limit = 500 }) {
      const afterDate = validDate(after, "Restore point is invalid.");
      const bounded = Math.max(
        1,
        Math.min(5000, Number.isSafeInteger(limit) ? limit : 500),
      );
      const pageCursor = validCursor(cursor);
      const result = await database.query(
        `SELECT ledger_sequence, marker_id, purge_cutoff_at, completed_at
         FROM completed_retention_purge_ledger
         WHERE completed_at > $1
           AND (
             $2::timestamptz IS NULL OR
             (completed_at, ledger_sequence) > ($2::timestamptz, $3::bigint)
           )
         ORDER BY completed_at, ledger_sequence
         LIMIT $4`,
        [
          afterDate,
          pageCursor?.completedAt || null,
          pageCursor?.sequence || null,
          bounded + 1,
        ],
      );
      const pageRows = result.rows.slice(0, bounded);
      const last = pageRows.at(-1);
      return {
        entries: pageRows.map((row) => ({
          markerId: String(row.marker_id),
          purgeCutoffAt: validDate(
            row.purge_cutoff_at,
            "Retention-purge cutoff is invalid.",
          ),
          completedAt: validDate(
            row.completed_at,
            "Retention-purge completion time is invalid.",
          ),
        })),
        nextCursor: result.rows.length > bounded && last
          ? {
              completedAt: validDate(
                last.completed_at,
                "Retention-purge completion time is invalid.",
              ).toISOString(),
              sequence: String(last.ledger_sequence),
            }
          : null,
      };
    },
  };
}

function decryptLedgerRow(row, keyring) {
  const requestId = String(row.request_id || "");
  requireRequestId(requestId);
  const keyVersion = Number(row.encryption_key_version);
  const key = keyring.get(keyVersion);
  if (!key) {
    throw new Error(`Deletion ledger encryption key version ${keyVersion} is unavailable.`);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(row.encryption_nonce),
  );
  decipher.setAAD(aad(requestId, keyVersion));
  decipher.setAuthTag(Buffer.from(row.encryption_auth_tag));
  const userId = Buffer.concat([
    decipher.update(Buffer.from(row.user_id_ciphertext)),
    decipher.final(),
  ]).toString("utf8");
  requireUserId(userId);
  return {
    requestId,
    userId,
    completedAt: validDate(row.completed_at, "Ledger completion time is invalid."),
  };
}

function aad(requestId, keyVersion) {
  return Buffer.from(`${requestId}:${keyVersion}`, "utf8");
}

function decodeEncryptionKey(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) {
    throw new Error("Deletion-ledger encryption keys must be 32-byte base64url values.");
  }
  const bytes = Buffer.from(text, "base64url");
  if (bytes.length !== 32) {
    throw new Error("Deletion-ledger encryption keys must contain exactly 32 bytes.");
  }
  return bytes;
}

function requireRequestId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""))) {
    throw new Error("Deletion ledger request ID is invalid.");
  }
}

function requireUserId(value) {
  if (!/^user_[A-Za-z0-9]{5,100}$/.test(String(value || ""))) {
    throw new Error("Deletion ledger account ID is invalid.");
  }
}

function validDate(value, message) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(message);
  return date;
}

function retentionDate(completedAt) {
  return new Date(completedAt.getTime() + LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function validCursor(value) {
  if (value == null) return null;
  const completedAt = validDate(value.completedAt, "Ledger cursor time is invalid.");
  const sequence = String(value.sequence || "");
  if (!/^[1-9][0-9]{0,18}$/.test(sequence)) {
    throw new Error("Ledger cursor sequence is invalid.");
  }
  return { completedAt, sequence };
}
