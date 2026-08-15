import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { createClerkClient } from "@clerk/backend";

const TOKEN_PREFIX = "ssv1";
const PAIRING_PREFIX = "ssp_";
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{32,160}$/;

export function createDeviceSessionService({
  store,
  signingKey,
  extensionIds,
  clerkSecretKey,
  clerkPublishableKey,
  clerkTimeoutMs = 10000,
  pairingTtlMs = 120000,
  accessTtlMs = 15 * 60 * 1000,
  refreshTtlMs = 30 * 24 * 60 * 60 * 1000,
  refreshGraceMs = 30000,
  clerkRecheckMs = 2000,
  now = () => new Date(),
  randomBytesFn = randomBytes,
  randomUUIDFn = randomUUID,
  verifyClerkSession,
  loadClerkProfile,
  clerkClient,
  assertUserAllowed = async () => true,
}) {
  if (!store) throw new Error("A device session store is required.");
  const keyBytes = decodeSigningKey(signingKey);
  const allowedExtensionIds = new Set(extensionIds || []);
  if (
    allowedExtensionIds.size === 0 ||
    [...allowedExtensionIds].some((id) => !EXTENSION_ID_PATTERN.test(id))
  ) {
    throw new Error("EXTENSION_IDS must contain valid Chrome extension IDs.");
  }

  let clerk = clerkClient;
  if (!verifyClerkSession || !loadClerkProfile) {
    if (!clerkSecretKey || !clerkPublishableKey) {
      throw new Error(
        "Clerk credentials are required for extension device sessions.",
      );
    }
    clerk ||= createClerkClient({
      secretKey: clerkSecretKey,
      publishableKey: clerkPublishableKey,
    });
  }

  const verifySession = verifyClerkSession || (async ({ sessionId, userId }) => {
    let session;
    try {
      session = await withTimeout(
        clerk.sessions.getSession(sessionId),
        clerkTimeoutMs,
      );
    } catch (error) {
      if (Number(error?.status) === 404) {
        throw deviceError(
          401,
          "DEVICE_SESSION_INACTIVE",
          "Your Zenaian sign-in is no longer active.",
        );
      }
      if (error?.code === "AUTH_SERVICE_TIMEOUT") throw error;
      throw deviceError(
        503,
        "AUTH_SERVICE_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
      );
    }
    if (
      !session ||
      session.id !== sessionId ||
      session.userId !== userId ||
      session.status !== "active"
    ) {
      throw deviceError(
        401,
        "DEVICE_SESSION_INACTIVE",
        "Your Zenaian sign-in is no longer active.",
      );
    }
  });

  const loadProfile = loadClerkProfile || (async (userId) => {
    let user;
    try {
      user = await withTimeout(clerk.users.getUser(userId), clerkTimeoutMs);
    } catch (error) {
      if (error?.code === "AUTH_SERVICE_TIMEOUT") throw error;
      throw deviceError(
        503,
        "AUTH_SERVICE_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
      );
    }
    const primaryEmail = user?.emailAddresses?.find(
      (entry) => entry.id === user.primaryEmailAddressId,
    )?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "";
    const displayName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(" ") || primaryEmail || "Zenaian user";
    return { email: primaryEmail, displayName };
  });
  const clerkChecks = new Map();

  async function confirmClerkSession(sessionId, userId) {
    const timestamp = now().getTime();
    const cached = clerkChecks.get(sessionId);
    if (
      cached?.userId === userId &&
      cached.verifiedUntil > timestamp
    ) {
      return;
    }
    if (cached?.userId === userId && cached.promise) {
      return cached.promise;
    }

    const promise = verifySession({ sessionId, userId })
      .then(() => {
        clerkChecks.set(sessionId, {
          userId,
          verifiedUntil: now().getTime() + clerkRecheckMs,
          promise: null,
        });
      })
      .catch((error) => {
        clerkChecks.delete(sessionId);
        throw error;
      });
    clerkChecks.set(sessionId, {
      userId,
      verifiedUntil: 0,
      promise,
    });
    return promise;
  }

  function signToken(type, session) {
    const issuedAt = Math.floor(session.issuedAt.getTime() / 1000);
    const expiresAt = Math.floor(
      (type === "access"
        ? session.accessExpiresAt
        : session.refreshExpiresAt).getTime() / 1000,
    );
    const payload = {
      v: 1,
      typ: type,
      sid: session.id,
      uid: session.userId,
      eid: session.extensionId,
      ver: session.tokenVersion,
      iat: issuedAt,
      exp: expiresAt,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const unsigned = `${TOKEN_PREFIX}.${encodedPayload}`;
    const signature = createHmac("sha256", keyBytes)
      .update(unsigned)
      .digest("base64url");
    return `${unsigned}.${signature}`;
  }

  function credentialsFor(session) {
    return {
      accessToken: signToken("access", session),
      accessExpiresAt: session.accessExpiresAt.toISOString(),
      refreshToken: signToken("refresh", session),
      refreshExpiresAt: session.refreshExpiresAt.toISOString(),
    };
  }

  function verifySignedToken(token, expectedType) {
    const value = String(token || "");
    if (value.length < 80 || value.length > 4096) {
      throw invalidDeviceToken();
    }
    const parts = value.split(".");
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
      throw invalidDeviceToken();
    }
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = createHmac("sha256", keyBytes).update(unsigned).digest();
    let received;
    try {
      received = Buffer.from(parts[2], "base64url");
    } catch {
      throw invalidDeviceToken();
    }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw invalidDeviceToken();
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
      throw invalidDeviceToken();
    }
    if (
      payload?.v !== 1 ||
      payload?.typ !== expectedType ||
      !isUuid(payload.sid) ||
      !/^user_[A-Za-z0-9]{5,100}$/.test(String(payload.uid || "")) ||
      !EXTENSION_ID_PATTERN.test(String(payload.eid || "")) ||
      !Number.isInteger(payload.ver) ||
      payload.ver < 1 ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp)
    ) {
      throw invalidDeviceToken();
    }
    return payload;
  }

  async function activeSessionForToken(payload, requestOrigin, type) {
    const expectedOrigin = `chrome-extension://${payload.eid}`;
    if (
      requestOrigin !== expectedOrigin ||
      !allowedExtensionIds.has(payload.eid)
    ) {
      throw deviceError(
        401,
        "DEVICE_TOKEN_ORIGIN_INVALID",
        "This extension session is not authorized for the current extension.",
      );
    }

    const current = now();
    if (payload.exp * 1000 <= current.getTime()) {
      throw deviceError(
        401,
        type === "refresh" ? "DEVICE_REFRESH_EXPIRED" : "DEVICE_ACCESS_EXPIRED",
        "The extension session expired.",
      );
    }
    const session = await store.getSession(payload.sid);
    if (
      !session ||
      session.revokedAt ||
      session.userId !== payload.uid ||
      session.extensionId !== payload.eid ||
      (type === "access" && session.tokenVersion !== payload.ver) ||
      session.refreshExpiresAt <= current
    ) {
      throw deviceError(
        401,
        "DEVICE_SESSION_INACTIVE",
        "The extension session is no longer active.",
      );
    }
    await assertUserAllowed(session.userId);
    await confirmClerkSession(session.clerkSessionId, session.userId);
    return session;
  }

  return {
    async initialize() {
      await store.initialize();
    },

    async close() {
      await store.close();
    },

    async maintenance() {
      const timestamp = now().getTime();
      for (const [sessionId, check] of clerkChecks) {
        if (!check.promise && check.verifiedUntil <= timestamp) {
          clerkChecks.delete(sessionId);
        }
      }
      return store.cleanupExpired(now());
    },

    async createPairing({ userId, clerkSessionId, extensionId, nonce }) {
      if (!allowedExtensionIds.has(extensionId)) {
        throw deviceError(
          400,
          "EXTENSION_ID_INVALID",
          "The requested Chrome extension is not supported.",
        );
      }
      validateNonce(nonce);
      await assertUserAllowed(userId);
      const rawCode = randomBytesFn(32).toString("base64url");
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + pairingTtlMs);
      await store.createPairing({
        id: randomUUIDFn(),
        codeHash: hash(`${PAIRING_PREFIX}${rawCode}`),
        nonceHash: hash(nonce),
        userId,
        clerkSessionId,
        extensionId,
        expiresAt,
      });
      return {
        pairingCode: `${PAIRING_PREFIX}${rawCode}`,
        expiresAt: expiresAt.toISOString(),
      };
    },

    async exchangePairing({ pairingCode, nonce, requestOrigin }) {
      validateNonce(nonce);
      if (!/^ssp_[A-Za-z0-9_-]{43}$/.test(String(pairingCode || ""))) {
        throw deviceError(
          401,
          "PAIRING_INVALID",
          "The extension connection request is invalid or expired.",
        );
      }
      const extensionId = extensionIdFromOrigin(requestOrigin);
      if (!allowedExtensionIds.has(extensionId)) {
        throw deviceError(
          401,
          "PAIRING_ORIGIN_INVALID",
          "The extension connection origin is not allowed.",
        );
      }
      const issuedAt = now();
      const session = await store.consumePairingAndCreateSession({
        codeHash: hash(pairingCode),
        nonceHash: hash(nonce),
        extensionId,
        now: issuedAt,
        session: {
          id: randomUUIDFn(),
          tokenVersion: 1,
          issuedAt,
          accessExpiresAt: new Date(issuedAt.getTime() + accessTtlMs),
          refreshExpiresAt: new Date(issuedAt.getTime() + refreshTtlMs),
        },
      });
      try {
        await assertUserAllowed(session.userId);
        await confirmClerkSession(session.clerkSessionId, session.userId);
      } catch (error) {
        if (error?.code === "ACCOUNT_DELETION_IN_PROGRESS") {
          await store.deleteSession?.(session.id).catch(() => undefined);
        }
        throw error;
      }
      return {
        ...credentialsFor(session),
        profile: {
          accountId: session.userId,
          ...await loadProfile(session.userId),
        },
      };
    },

    async authenticateAccess(request) {
      requireSingleHeader(request, "authorization");
      requireSingleHeader(request, "origin");
      const payload = verifySignedToken(readBearer(request), "access");
      const session = await activeSessionForToken(
        payload,
        requestOrigin(request),
        "access",
      );
      void store.touchSession(session.id, now()).catch(() => undefined);
      return {
        userId: session.userId,
        sessionId: session.clerkSessionId,
        organizationId: null,
        deviceSessionId: session.id,
        extensionId: session.extensionId,
      };
    },

    async refresh({ refreshToken, requestOrigin }) {
      const payload = verifySignedToken(refreshToken, "refresh");
      const session = await activeSessionForToken(
        payload,
        requestOrigin,
        "refresh",
      );
      const issuedAt = now();
      const rotated = await store.rotateSession({
        sessionId: session.id,
        presentedVersion: payload.ver,
        now: issuedAt,
        previousValidUntil: new Date(issuedAt.getTime() + refreshGraceMs),
        issuedAt,
        accessExpiresAt: new Date(issuedAt.getTime() + accessTtlMs),
        refreshExpiresAt: new Date(issuedAt.getTime() + refreshTtlMs),
      });
      return credentialsFor(rotated);
    },

    async profile(userId) {
      await assertUserAllowed(userId);
      return {
        accountId: userId,
        ...await loadProfile(userId),
      };
    },

    async revokeUserSessions(userId) {
      for (const [sessionId, check] of clerkChecks) {
        if (check.userId === userId) clerkChecks.delete(sessionId);
      }
      return store.revokeUserSessions(userId, now());
    },

    async revokeClerkSession(clerkSessionId) {
      clerkChecks.delete(clerkSessionId);
      return store.revokeClerkSession(clerkSessionId, now());
    },

    async revokeDeviceSession(deviceSessionId) {
      return store.revokeSession(deviceSessionId, now());
    },
  };
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function decodeSigningKey(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{43,180}$/.test(text)) {
    throw new Error(
      "EXTENSION_SESSION_SIGNING_KEY must be a base64url secret containing at least 32 bytes.",
    );
  }
  let bytes;
  try {
    bytes = Buffer.from(text, "base64url");
  } catch {
    throw new Error("EXTENSION_SESSION_SIGNING_KEY is not valid base64url.");
  }
  if (bytes.length < 32) {
    throw new Error(
      "EXTENSION_SESSION_SIGNING_KEY must contain at least 32 bytes.",
    );
  }
  return bytes;
}

function extensionIdFromOrigin(origin) {
  const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(String(origin || ""));
  if (!match) {
    throw deviceError(
      401,
      "PAIRING_ORIGIN_INVALID",
      "The extension connection origin is not allowed.",
    );
  }
  return match[1];
}

function validateNonce(nonce) {
  if (!NONCE_PATTERN.test(String(nonce || ""))) {
    throw deviceError(
      400,
      "PAIRING_NONCE_INVALID",
      "The extension connection nonce is invalid.",
    );
  }
}

function readBearer(request) {
  const value = String(request.headers?.authorization || "");
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  if (!match) throw invalidDeviceToken();
  return match[1];
}

function requestOrigin(request) {
  return String(request.headers?.origin || "").trim().replace(/\/$/, "");
}

function requireSingleHeader(request, name) {
  const distinct = request.headersDistinct?.[name];
  const fallback = request.headers?.[name];
  const values = Array.isArray(distinct)
    ? distinct
    : Array.isArray(fallback)
      ? fallback
      : fallback == null
        ? []
        : [fallback];
  if (values.length <= 1) return;
  throw deviceError(
    400,
    "AMBIGUOUS_SECURITY_HEADER",
    `Multiple ${name} headers are not allowed.`,
  );
}

function invalidDeviceToken() {
  return deviceError(
    401,
    "DEVICE_TOKEN_INVALID",
    "The extension session could not be verified.",
  );
}

function deviceError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        deviceError(
          503,
          "AUTH_SERVICE_TIMEOUT",
          "Authentication service timed out.",
        ),
      );
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}
