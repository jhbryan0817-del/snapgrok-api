import assert from "node:assert/strict";
import test from "node:test";
import { createDeviceSessionService } from "../src/device-auth.js";

const EXTENSION_ID = "jjgjlopdpefphgappfmkkkpiknpnoijb";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const USER_ID = "user_abcdef12345";
const CLERK_SESSION_ID = "sess_active12345";
const SIGNING_KEY = Buffer.alloc(32, 7).toString("base64url");

test("one-time pairing creates an exact-origin device session", async () => {
  const { service, store } = fixture();
  const nonce = Buffer.alloc(32, 3).toString("base64url");
  const pairing = await service.createPairing({
    userId: USER_ID,
    clerkSessionId: CLERK_SESSION_ID,
    extensionId: EXTENSION_ID,
    nonce,
  });
  assert.match(pairing.pairingCode, /^ssp_[A-Za-z0-9_-]{43}$/);

  const session = await service.exchangePairing({
    pairingCode: pairing.pairingCode,
    nonce,
    requestOrigin: EXTENSION_ORIGIN,
  });
  assert.match(session.accessToken, /^ssv1\./);
  assert.match(session.refreshToken, /^ssv1\./);
  assert.equal(session.profile.accountId, USER_ID);
  assert.equal(session.profile.email, "person@example.com");

  await assert.rejects(
    service.exchangePairing({
      pairingCode: pairing.pairingCode,
      nonce,
      requestOrigin: EXTENSION_ORIGIN,
    }),
    (error) => error.code === "PAIRING_INVALID" && error.status === 401,
  );

  const auth = await service.authenticateAccess(requestFor(
    session.accessToken,
    EXTENSION_ORIGIN,
  ));
  assert.equal(auth.userId, USER_ID);
  assert.equal(auth.extensionId, EXTENSION_ID);
  assert.equal(store.sessions.size, 1);
});

test("device credentials cannot be replayed from a website or another extension", async () => {
  const { service } = fixture();
  const session = await pairedSession(service);

  await assert.rejects(
    service.authenticateAccess(requestFor(
      session.accessToken,
      "https://www.zenaian.com",
    )),
    (error) => error.code === "DEVICE_TOKEN_ORIGIN_INVALID",
  );
  await assert.rejects(
    service.refresh({
      refreshToken: session.refreshToken,
      requestOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    }),
    (error) => error.code === "DEVICE_TOKEN_ORIGIN_INVALID",
  );
});

test("refresh credentials rotate and stale reuse revokes the session", async () => {
  let clock = new Date("2026-08-01T00:00:00.000Z");
  const { service } = fixture({ now: () => new Date(clock) });
  const original = await pairedSession(service);
  const refreshed = await service.refresh({
    refreshToken: original.refreshToken,
    requestOrigin: EXTENSION_ORIGIN,
  });
  assert.notEqual(refreshed.refreshToken, original.refreshToken);

  const gracefulRetry = await service.refresh({
    refreshToken: original.refreshToken,
    requestOrigin: EXTENSION_ORIGIN,
  });
  assert.equal(gracefulRetry.refreshToken, refreshed.refreshToken);

  clock = new Date(clock.getTime() + 31_000);
  await assert.rejects(
    service.refresh({
      refreshToken: original.refreshToken,
      requestOrigin: EXTENSION_ORIGIN,
    }),
    (error) => error.code === "DEVICE_REFRESH_REUSED",
  );
  await assert.rejects(
    service.authenticateAccess(requestFor(
      refreshed.accessToken,
      EXTENSION_ORIGIN,
    )),
    (error) => error.code === "DEVICE_SESSION_INACTIVE",
  );
});

test("every access check fails closed after the Clerk session ends", async () => {
  let active = true;
  const { service } = fixture({
    verifyClerkSession: async () => {
      if (!active) {
        throw Object.assign(new Error("inactive"), {
          status: 401,
          code: "DEVICE_SESSION_INACTIVE",
        });
      }
    },
  });
  const session = await pairedSession(service);
  active = false;
  await assert.rejects(
    service.authenticateAccess(requestFor(
      session.accessToken,
      EXTENSION_ORIGIN,
    )),
    (error) => error.code === "DEVICE_SESSION_INACTIVE",
  );
});

test("short Clerk recheck caching bounds polling load without caching revocation state", async () => {
  let clock = new Date("2026-08-01T00:00:00.000Z");
  let checks = 0;
  const { service } = fixture({
    now: () => new Date(clock),
    clerkRecheckMs: 2000,
    verifyClerkSession: async () => { checks += 1; },
  });
  const session = await pairedSession(service);
  assert.equal(checks, 1);
  await service.authenticateAccess(requestFor(session.accessToken, EXTENSION_ORIGIN));
  await service.authenticateAccess(requestFor(session.accessToken, EXTENSION_ORIGIN));
  assert.equal(checks, 1);
  clock = new Date(clock.getTime() + 2001);
  await service.authenticateAccess(requestFor(session.accessToken, EXTENSION_ORIGIN));
  assert.equal(checks, 2);
  await service.revokeUserSessions(USER_ID);
  await assert.rejects(
    service.authenticateAccess(requestFor(session.accessToken, EXTENSION_ORIGIN)),
    (error) => error.code === "DEVICE_SESSION_INACTIVE",
  );
});

async function pairedSession(service) {
  const nonce = Buffer.alloc(32, 4).toString("base64url");
  const pairing = await service.createPairing({
    userId: USER_ID,
    clerkSessionId: CLERK_SESSION_ID,
    extensionId: EXTENSION_ID,
    nonce,
  });
  return service.exchangePairing({
    pairingCode: pairing.pairingCode,
    nonce,
    requestOrigin: EXTENSION_ORIGIN,
  });
}

function requestFor(token, origin) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      origin,
    },
    headersDistinct: {
      authorization: [`Bearer ${token}`],
      origin: [origin],
    },
  };
}

function fixture(overrides = {}) {
  const store = memoryStore();
  let codeCounter = 0;
  let uuidCounter = 0;
  const service = createDeviceSessionService({
    store,
    signingKey: SIGNING_KEY,
    extensionIds: [EXTENSION_ID],
    clerkRecheckMs: overrides.clerkRecheckMs ?? 0,
    now: overrides.now || (() => new Date("2026-08-01T00:00:00.000Z")),
    randomBytesFn: () => Buffer.alloc(32, ++codeCounter),
    randomUUIDFn: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
    verifyClerkSession: overrides.verifyClerkSession || (async () => undefined),
    loadClerkProfile: async () => ({
      email: "person@example.com",
      displayName: "Test Person",
    }),
  });
  return { service, store };
}

function memoryStore() {
  const pairings = new Map();
  const sessions = new Map();
  return {
    pairings,
    sessions,
    async initialize() {},
    async close() {},
    async cleanupExpired() { return 0; },
    async createPairing(pairing) {
      pairings.set(pairing.codeHash, { ...pairing, consumedAt: null });
    },
    async consumePairingAndCreateSession(input) {
      const pairing = pairings.get(input.codeHash);
      if (
        !pairing ||
        pairing.consumedAt ||
        pairing.nonceHash !== input.nonceHash ||
        pairing.extensionId !== input.extensionId ||
        pairing.expiresAt <= input.now
      ) {
        throw Object.assign(new Error("invalid"), { status: 401, code: "PAIRING_INVALID" });
      }
      pairing.consumedAt = input.now;
      const session = {
        ...input.session,
        userId: pairing.userId,
        clerkSessionId: pairing.clerkSessionId,
        extensionId: pairing.extensionId,
        previousTokenVersion: null,
        previousValidUntil: null,
        revokedAt: null,
      };
      sessions.set(session.id, session);
      return { ...session };
    },
    async getSession(id) {
      const session = sessions.get(id);
      return session ? { ...session } : null;
    },
    async touchSession() {},
    async rotateSession(input) {
      const current = sessions.get(input.sessionId);
      if (!current || current.revokedAt) {
        throw Object.assign(new Error("inactive"), {
          status: 401,
          code: "DEVICE_SESSION_INACTIVE",
        });
      }
      if (
        input.presentedVersion === current.previousTokenVersion &&
        current.previousValidUntil > input.now
      ) {
        return { ...current };
      }
      if (input.presentedVersion !== current.tokenVersion) {
        current.revokedAt = input.now;
        throw Object.assign(new Error("reuse"), {
          status: 401,
          code: "DEVICE_REFRESH_REUSED",
        });
      }
      Object.assign(current, {
        previousTokenVersion: current.tokenVersion,
        previousValidUntil: input.previousValidUntil,
        tokenVersion: current.tokenVersion + 1,
        issuedAt: input.issuedAt,
        accessExpiresAt: input.accessExpiresAt,
        refreshExpiresAt: input.refreshExpiresAt,
      });
      return { ...current };
    },
    async revokeUserSessions(userId, now) {
      let count = 0;
      for (const session of sessions.values()) {
        if (session.userId === userId && !session.revokedAt) {
          session.revokedAt = now;
          count += 1;
        }
      }
      return count;
    },
    async revokeClerkSession() { return 0; },
    async revokeSession(id, now) {
      const session = sessions.get(id);
      if (!session || session.revokedAt) return 0;
      session.revokedAt = now;
      return 1;
    },
  };
}
