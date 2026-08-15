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
  const pool = {
    async query() {
      throw Object.assign(new Error("ACCOUNT_DELETION_IN_PROGRESS"), {
        code: "P0001",
      });
    },
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
});
