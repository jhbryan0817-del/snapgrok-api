import pg from "pg";

const { Pool } = pg;

export function createPostgresDeviceSessionStore({
  connectionString,
  pool,
  poolMax = 10,
  connectionTimeoutMs = 5000,
  statementTimeoutMs = 10000,
}) {
  if (!pool && !connectionString) {
    throw new Error("DATABASE_URL is required for extension device sessions.");
  }

  const database = pool || new Pool({
    connectionString,
    max: poolMax,
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
    application_name: "zenaian-extension-auth",
  });
  const ownsPool = !pool;

  return {
    async initialize() {
      const result = await database.query(
        `SELECT
           to_regclass('extension_pairing_grants') AS pairing_table,
           to_regclass('extension_device_sessions') AS sessions_table`,
      );
      if (!result.rows[0]?.pairing_table || !result.rows[0]?.sessions_table) {
        throw storeError(
          "Extension authentication database migrations have not been applied.",
          "EXTENSION_AUTH_DATABASE_NOT_MIGRATED",
        );
      }
    },

    async close() {
      if (ownsPool) await database.end();
    },

    async createPairing(pairing) {
      await database.query(
        `INSERT INTO extension_pairing_grants (
           id, code_hash, nonce_hash, clerk_user_id, clerk_session_id,
           extension_id, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pairing.id,
          pairing.codeHash,
          pairing.nonceHash,
          pairing.userId,
          pairing.clerkSessionId,
          pairing.extensionId,
          pairing.expiresAt,
        ],
      );
    },

    async consumePairingAndCreateSession({
      codeHash,
      nonceHash,
      extensionId,
      now,
      session,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const pairingResult = await client.query(
          `UPDATE extension_pairing_grants
           SET consumed_at = $2
           WHERE code_hash = $1
             AND nonce_hash = $3
             AND extension_id = $4
             AND consumed_at IS NULL
             AND expires_at > $2
           RETURNING clerk_user_id, clerk_session_id, extension_id`,
          [codeHash, now, nonceHash, extensionId],
        );
        const pairing = pairingResult.rows[0];
        if (!pairing) {
          throw storeError(
            "The extension connection request is invalid or expired.",
            "PAIRING_INVALID",
            401,
          );
        }

        await client.query(
          `INSERT INTO extension_device_sessions (
             id, clerk_user_id, clerk_session_id, extension_id,
             token_version, issued_at, access_expires_at, refresh_expires_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            session.id,
            pairing.clerk_user_id,
            pairing.clerk_session_id,
            pairing.extension_id,
            session.tokenVersion,
            session.issuedAt,
            session.accessExpiresAt,
            session.refreshExpiresAt,
          ],
        );
        await client.query("COMMIT");
        return {
          ...session,
          userId: pairing.clerk_user_id,
          clerkSessionId: pairing.clerk_session_id,
          extensionId: pairing.extension_id,
          revokedAt: null,
        };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeStoreError(error);
      } finally {
        client.release();
      }
    },

    async getSession(sessionId) {
      const result = await database.query(
        `SELECT id, clerk_user_id, clerk_session_id, extension_id,
                token_version, previous_token_version, previous_valid_until,
                issued_at, access_expires_at, refresh_expires_at, revoked_at
         FROM extension_device_sessions
         WHERE id = $1`,
        [sessionId],
      );
      return result.rows[0] ? mapSession(result.rows[0]) : null;
    },

    async touchSession(sessionId, now) {
      await database.query(
        `UPDATE extension_device_sessions
         SET last_seen_at = $2, updated_at = $2
         WHERE id = $1 AND revoked_at IS NULL`,
        [sessionId, now],
      );
    },

    async rotateSession({
      sessionId,
      presentedVersion,
      now,
      previousValidUntil,
      issuedAt,
      accessExpiresAt,
      refreshExpiresAt,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const currentResult = await client.query(
          `SELECT id, clerk_user_id, clerk_session_id, extension_id,
                  token_version, previous_token_version, previous_valid_until,
                  issued_at, access_expires_at, refresh_expires_at, revoked_at
           FROM extension_device_sessions
           WHERE id = $1
           FOR UPDATE`,
          [sessionId],
        );
        const current = currentResult.rows[0]
          ? mapSession(currentResult.rows[0])
          : null;
        if (!current || current.revokedAt || current.refreshExpiresAt <= now) {
          throw storeError(
            "The extension session is no longer active.",
            "DEVICE_SESSION_INACTIVE",
            401,
          );
        }

        if (
          presentedVersion === current.previousTokenVersion &&
          current.previousValidUntil &&
          current.previousValidUntil > now
        ) {
          await client.query("COMMIT");
          return current;
        }

        if (presentedVersion !== current.tokenVersion) {
          await client.query(
            `UPDATE extension_device_sessions
             SET revoked_at = $2, updated_at = $2
             WHERE id = $1`,
            [sessionId, now],
          );
          await client.query("COMMIT");
          throw storeError(
            "The extension refresh credential was reused after rotation.",
            "DEVICE_REFRESH_REUSED",
            401,
          );
        }

        const nextVersion = current.tokenVersion + 1;
        const updatedResult = await client.query(
          `UPDATE extension_device_sessions
           SET previous_token_version = token_version,
               previous_valid_until = $2,
               token_version = $3,
               issued_at = $4,
               access_expires_at = $5,
               refresh_expires_at = $6,
               last_seen_at = $4,
               updated_at = $4
           WHERE id = $1
           RETURNING id, clerk_user_id, clerk_session_id, extension_id,
                     token_version, previous_token_version, previous_valid_until,
                     issued_at, access_expires_at, refresh_expires_at, revoked_at`,
          [
            sessionId,
            previousValidUntil,
            nextVersion,
            issuedAt,
            accessExpiresAt,
            refreshExpiresAt,
          ],
        );
        await client.query("COMMIT");
        return mapSession(updatedResult.rows[0]);
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeStoreError(error);
      } finally {
        client.release();
      }
    },

    async revokeUserSessions(userId, now) {
      const result = await database.query(
        `UPDATE extension_device_sessions
         SET revoked_at = COALESCE(revoked_at, $2), updated_at = $2
         WHERE clerk_user_id = $1 AND revoked_at IS NULL`,
        [userId, now],
      );
      return result.rowCount;
    },

    async revokeClerkSession(clerkSessionId, now) {
      const result = await database.query(
        `UPDATE extension_device_sessions
         SET revoked_at = COALESCE(revoked_at, $2), updated_at = $2
         WHERE clerk_session_id = $1 AND revoked_at IS NULL`,
        [clerkSessionId, now],
      );
      return result.rowCount;
    },

    async revokeSession(sessionId, now) {
      const result = await database.query(
        `UPDATE extension_device_sessions
         SET revoked_at = COALESCE(revoked_at, $2), updated_at = $2
         WHERE id = $1 AND revoked_at IS NULL`,
        [sessionId, now],
      );
      return result.rowCount;
    },

    async cleanupExpired(now, batchSize = 1000) {
      const current = now instanceof Date ? now : new Date(now);
      if (!Number.isFinite(current.getTime())) {
        throw storeError(
          "Extension authentication cleanup received an invalid timestamp.",
          "EXTENSION_AUTH_CLEANUP_INVALID",
        );
      }
      const boundedBatchSize = Math.max(
        1,
        Math.min(5000, Number.isSafeInteger(batchSize) ? batchSize : 1000),
      );
      const pairingRetentionCutoff = new Date(current.getTime() - 60 * 60 * 1000);
      const sessionRetentionCutoff = new Date(
        current.getTime() - 7 * 24 * 60 * 60 * 1000,
      );

      try {
        const pairings = await database.query(
          `WITH expired AS (
             SELECT id
             FROM extension_pairing_grants
             WHERE expires_at < $1
                OR (consumed_at IS NOT NULL AND consumed_at < $2)
             ORDER BY COALESCE(consumed_at, expires_at), id
             LIMIT $3
             FOR UPDATE SKIP LOCKED
           )
           DELETE FROM extension_pairing_grants AS pairing
           USING expired
           WHERE pairing.id = expired.id`,
          [current, pairingRetentionCutoff, boundedBatchSize],
        );
        const sessions = await database.query(
          `WITH expired AS (
             SELECT id
             FROM extension_device_sessions
             WHERE refresh_expires_at < $1
                OR (revoked_at IS NOT NULL AND revoked_at < $1)
             ORDER BY COALESCE(revoked_at, refresh_expires_at), id
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           )
           DELETE FROM extension_device_sessions AS session
           USING expired
           WHERE session.id = expired.id`,
          [sessionRetentionCutoff, boundedBatchSize],
        );
        return Number(pairings.rowCount || 0) + Number(sessions.rowCount || 0);
      } catch (error) {
        throw normalizeStoreError(error);
      }
    },
  };
}

function mapSession(row) {
  return {
    id: row.id,
    userId: row.clerk_user_id,
    clerkSessionId: row.clerk_session_id,
    extensionId: row.extension_id,
    tokenVersion: Number(row.token_version),
    previousTokenVersion:
      row.previous_token_version == null
        ? null
        : Number(row.previous_token_version),
    previousValidUntil: toDateOrNull(row.previous_valid_until),
    issuedAt: new Date(row.issued_at),
    accessExpiresAt: new Date(row.access_expires_at),
    refreshExpiresAt: new Date(row.refresh_expires_at),
    revokedAt: toDateOrNull(row.revoked_at),
  };
}

function toDateOrNull(value) {
  return value == null ? null : new Date(value);
}

function storeError(message, code, status = 503) {
  return Object.assign(new Error(message), { status, code });
}

function normalizeStoreError(error) {
  if (error?.code && /^[A-Z][A-Z0-9_]+$/.test(error.code)) return error;
  const normalized = storeError(
    "Extension authentication storage is temporarily unavailable.",
    "EXTENSION_AUTH_DATABASE_UNAVAILABLE",
  );
  normalized.databaseCode = /^[A-Z0-9]{5}$/.test(String(error?.code || ""))
    ? error.code
    : undefined;
  return normalized;
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {}
}
