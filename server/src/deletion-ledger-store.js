import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import pg from "pg";

const { Pool } = pg;

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

  return {
    async initialize() {
      const result = await database.query(
        `SELECT to_regclass('public.completed_deletion_ledger') IS NOT NULL AS present,
                has_table_privilege(
                  current_user,
                  'public.completed_deletion_ledger',
                  'SELECT'
                ) AS can_select,
                has_table_privilege(
                  current_user,
                  'public.completed_deletion_ledger',
                  'INSERT'
                ) AS can_insert,
                has_table_privilege(
                  current_user,
                  'public.completed_deletion_ledger',
                  'UPDATE'
                ) AS can_update,
                has_table_privilege(
                  current_user,
                  'public.completed_deletion_ledger',
                  'DELETE'
                ) AS can_delete`,
      );
      const state = result.rows[0] || {};
      if (
        state.present !== true || state.can_select !== true ||
        state.can_insert !== true || state.can_update === true ||
        state.can_delete === true
      ) {
        throw new Error(
          "Deletion ledger readiness requires SELECT/INSERT-only access to the external append-only table.",
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
           completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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
        ],
      );
      if (inserted.rowCount === 1) return true;
      const existing = await database.query(
        `SELECT subject_hmac
         FROM completed_deletion_ledger
         WHERE request_id = $1`,
        [requestId],
      );
      if (String(existing.rows[0]?.subject_hmac || "") !== subjectHmac) {
        throw new Error("Deletion ledger request identity conflict.");
      }
      return false;
    },

    async listCompletedAfter(after, limit = 500) {
      const afterDate = validDate(after, "Restore point is invalid.");
      const bounded = Math.max(
        1,
        Math.min(5000, Number.isSafeInteger(limit) ? limit : 500),
      );
      const result = await database.query(
        `SELECT request_id, encryption_key_version, user_id_ciphertext,
                encryption_nonce, encryption_auth_tag, completed_at
         FROM completed_deletion_ledger
         WHERE completed_at > $1
         ORDER BY completed_at, ledger_sequence
         LIMIT $2`,
        [afterDate, bounded],
      );
      return result.rows.map((row) => decryptLedgerRow(row, keyring));
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
