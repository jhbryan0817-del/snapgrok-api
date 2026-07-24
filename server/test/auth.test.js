import assert from "node:assert/strict";
import test from "node:test";
import { createAuthenticator } from "../src/auth.js";

const request = {
  method: "POST",
  url: "/api/analyze",
  headers: {
    host: "sneaksolve-api.example",
    origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    authorization: "Bearer test-token",
  },
};

function clerkStub({ sessionStatus = "active", sessionError = null } = {}) {
  return {
    authenticateRequest: async () => ({
      isAuthenticated: true,
      toAuth: () => ({
        userId: "user_test",
        sessionId: "sess_test",
        orgId: null,
      }),
    }),
    sessions: {
      getSession: async () => {
        if (sessionError) throw sessionError;
        return {
          id: "sess_test",
          userId: "user_test",
          status: sessionStatus,
        };
      },
    },
  };
}

function authenticator(client) {
  return createAuthenticator({
    secretKey: "sk_test_stub",
    publishableKey: "pk_test_unit_test_key",
    jwtKey: "",
    authorizedParties: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop"],
    clerkClient: client,
  });
}

test("accepts a signed token only while its Clerk session is active", async () => {
  const identity = await authenticator(clerkStub())(request);
  assert.deepEqual(identity, {
    userId: "user_test",
    sessionId: "sess_test",
    organizationId: null,
  });
});

test("rejects a locally valid token after the Clerk session ends", async () => {
  await assert.rejects(
    authenticator(clerkStub({ sessionStatus: "ended" }))(request),
    (error) => error.status === 401 && error.code === "AUTH_SESSION_INACTIVE",
  );
});

test("fails closed when Clerk cannot confirm current session state", async () => {
  await assert.rejects(
    authenticator(clerkStub({ sessionError: Object.assign(new Error("network"), { status: 503 }) }))(request),
    (error) => error.status === 503 && error.code === "AUTH_SERVICE_UNAVAILABLE",
  );
});
