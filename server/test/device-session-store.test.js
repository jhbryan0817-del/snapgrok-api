import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresDeviceSessionStore } from "../src/device-session-store.js";

test("extension maintenance deletes expired rows in bounded indexed batches", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: calls.length === 1 ? 3 : 2, rows: [] };
    },
  };
  const store = createPostgresDeviceSessionStore({ pool });
  const now = new Date("2026-08-05T00:00:00.000Z");
  assert.equal(await store.cleanupExpired(now, 250), 5);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /LIMIT \$3[\s\S]*FOR UPDATE SKIP LOCKED/);
  assert.match(calls[1].sql, /LIMIT \$2[\s\S]*FOR UPDATE SKIP LOCKED/);
  assert.equal(calls[0].params[0].toISOString(), now.toISOString());
  assert.equal(
    calls[0].params[1].toISOString(),
    "2026-08-04T23:00:00.000Z",
  );
  assert.equal(
    calls[1].params[0].toISOString(),
    "2026-07-29T00:00:00.000Z",
  );
  assert.equal(calls[0].params[2], 250);
});

test("extension maintenance exposes a safe database error class", async () => {
  const pool = {
    async query() {
      throw Object.assign(new Error("database detail must stay private"), {
        code: "57014",
      });
    },
  };
  const store = createPostgresDeviceSessionStore({ pool });
  await assert.rejects(
    store.cleanupExpired(new Date()),
    (error) =>
      error.code === "EXTENSION_AUTH_DATABASE_UNAVAILABLE" &&
      error.databaseCode === "57014" &&
      !error.message.includes("private"),
  );
});

test("privacy trigger errors become the public account-deletion block", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("INSERT INTO extension_pairing_grants")) {
        throw Object.assign(new Error("ACCOUNT_DELETION_IN_PROGRESS"), {
          code: "P0001",
        });
      }
      if (sql.includes("count(*)")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
  };
  const store = createPostgresDeviceSessionStore({ pool });
  await assert.rejects(
    store.createPairing({
      id: "00000000-0000-4000-8000-000000000001",
      codeHash: "a".repeat(64),
      nonceHash: "b".repeat(64),
      userId: "user_abcdef12345",
      clerkSessionId: "sess_abcdef12345",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      expiresAt: new Date(Date.now() + 60_000),
    }),
    (error) =>
      error.status === 403 && error.code === "ACCOUNT_DELETION_IN_PROGRESS",
  );
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("pairing creation enforces the per-user cap under a transaction lock", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("count(*)")) return { rows: [{ count: 3 }] };
      return { rows: [] };
    },
    release() {},
  };
  const store = createPostgresDeviceSessionStore({
    pool: { async connect() { return client; } },
  });
  await assert.rejects(
    store.createPairing({
      id: "00000000-0000-4000-8000-000000000001",
      codeHash: "a".repeat(64),
      nonceHash: "b".repeat(64),
      userId: "user_abcdef12345",
      clerkSessionId: "sess_abcdef12345",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      expiresAt: new Date(Date.now() + 60_000),
    }),
    (error) => error.status === 429 && error.code === "PAIRING_LIMIT_REACHED",
  );
  assert.match(calls[1], /pg_advisory_xact_lock/);
  assert.doesNotMatch(calls.join("\n"), /INSERT INTO extension_pairing_grants/);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("pairing exchange rolls back instead of exceeding the device-session cap", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("UPDATE extension_pairing_grants")) {
        return {
          rows: [{
            clerk_user_id: "user_abcdef12345",
            clerk_session_id: "sess_abcdef12345",
            extension_id: "abcdefghijklmnopabcdefghijklmnop",
          }],
        };
      }
      if (sql.includes("count(*)")) return { rows: [{ count: 5 }] };
      return { rows: [] };
    },
    release() {},
  };
  const store = createPostgresDeviceSessionStore({
    pool: { async connect() { return client; } },
  });
  await assert.rejects(
    store.consumePairingAndCreateSession({
      codeHash: "a".repeat(64),
      nonceHash: "b".repeat(64),
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      now: new Date(),
      session: {
        id: "00000000-0000-4000-8000-000000000002",
        tokenVersion: 1,
        issuedAt: new Date(),
        accessExpiresAt: new Date(Date.now() + 60_000),
        refreshExpiresAt: new Date(Date.now() + 120_000),
      },
    }),
    (error) =>
      error.status === 429 && error.code === "DEVICE_SESSION_LIMIT_REACHED",
  );
  assert.match(calls[2], /pg_advisory_xact_lock/);
  assert.doesNotMatch(calls.join("\n"), /INSERT INTO extension_device_sessions/);
  assert.equal(calls.at(-1), "ROLLBACK");
});
