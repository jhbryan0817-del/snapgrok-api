import assert from "node:assert/strict";
import test from "node:test";
import { createAuthenticator } from "../src/auth.js";

const request = {
  method: "POST",
  url: "/api/analyze",
  headers: {
    host: "sneaksolve-api.example",
    origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    authorization: `Bearer ${testJwt({
      azp: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      sid: "sess_test",
      sub: "user_test",
    })}`,
  },
};

function clerkStub({
  sessionStatus = "active",
  sessionError = null,
  requestState = null,
  onAuthenticate = null,
} = {}) {
  return {
    authenticateRequest: async (_request, options) => {
      onAuthenticate?.(options);
      return requestState || {
        isAuthenticated: true,
        toAuth: () => ({
          userId: "user_test",
          sessionId: "sess_test",
          orgId: null,
        }),
      };
    },
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

function authenticator(client, options = {}) {
  return createAuthenticator({
    secretKey: "sk_test_stub",
    publishableKey: "pk_test_unit_test_key",
    jwtKey: "",
    authorizedParties: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop"],
    clerkClient: client,
    ...options,
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

test("accepts a Clerk native token without azp only from the exact configured extension origin", async () => {
  let receivedOptions;
  const nativeRequest = {
    ...request,
    headers: {
      ...request.headers,
      authorization: `Bearer ${testJwt({ sid: "sess_test", sub: "user_test" })}`,
    },
  };

  const identity = await authenticator(
    clerkStub({
      onAuthenticate: (options) => {
        receivedOptions = options;
      },
    }),
  )(nativeRequest);

  assert.equal(identity.userId, "user_test");
  assert.equal(receivedOptions.acceptsToken, "session_token");
  assert.equal(receivedOptions.authorizedParties, undefined);
});

test("rejects a token without azp when the request is not bound to the configured extension origin", async () => {
  const wrongOriginRequest = {
    ...request,
    headers: {
      ...request.headers,
      origin: "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      authorization: `Bearer ${testJwt({ sid: "sess_test", sub: "user_test" })}`,
    },
  };

  await assert.rejects(
    authenticator(clerkStub())(wrongOriginRequest),
    (error) =>
      error.status === 401 && error.code === "AUTH_TOKEN_PARTY_INVALID",
  );
});

test("continues enforcing authorizedParties when the token contains azp", async () => {
  let receivedOptions;
  const browserRequest = {
    ...request,
    headers: {
      ...request.headers,
      authorization: `Bearer ${testJwt({
        azp: request.headers.origin,
        sid: "sess_test",
        sub: "user_test",
      })}`,
    },
  };

  await authenticator(
    clerkStub({
      onAuthenticate: (options) => {
        receivedOptions = options;
      },
    }),
  )(browserRequest);

  assert.deepEqual(receivedOptions.authorizedParties, [
    request.headers.origin,
  ]);
});

test("maps Clerk verification reasons without exposing the token", async () => {
  const invalidPartyState = {
    isAuthenticated: false,
    reason: "token-invalid-authorized-parties",
  };

  await assert.rejects(
    authenticator(clerkStub({ requestState: invalidPartyState }))(request),
    (error) =>
      error.status === 401 &&
      error.code === "AUTH_TOKEN_PARTY_INVALID" &&
      error.authReason === "token-invalid-authorized-parties" &&
      !error.message.includes("test-signature"),
  );
});

test("rejects missing, malformed, or oversized bearer tokens before Clerk", async () => {
  let clerkCalls = 0;
  const authenticate = authenticator(
    clerkStub({ onAuthenticate: () => { clerkCalls += 1; } }),
  );

  for (const authorization of [
    undefined,
    "Bearer not-a-jwt",
    `Bearer ${"a".repeat(8200)}`,
  ]) {
    const headers = { ...request.headers };
    if (authorization === undefined) delete headers.authorization;
    else headers.authorization = authorization;
    await assert.rejects(
      authenticate({ ...request, headers }),
      (error) =>
        error.status === 401 &&
        ["AUTH_REQUIRED", "AUTH_TOKEN_INVALID"].includes(error.code),
    );
  }

  assert.equal(clerkCalls, 0);
});

test("rejects duplicate authorization and origin headers before Clerk", async () => {
  let clerkCalls = 0;
  const authenticate = authenticator(
    clerkStub({ onAuthenticate: () => { clerkCalls += 1; } }),
  );

  for (const name of ["authorization", "origin"]) {
    await assert.rejects(
      authenticate({
        ...request,
        headersDistinct: {
          [name]: [request.headers[name], request.headers[name]],
        },
      }),
      (error) =>
        error.status === 400 && error.code === "AMBIGUOUS_SECURITY_HEADER",
    );
  }

  assert.equal(clerkCalls, 0);
});

test("passes a configured audience to Clerk verification", async () => {
  let receivedOptions;
  await authenticator(
    clerkStub({ onAuthenticate: (options) => { receivedOptions = options; } }),
    { audience: ["sneaksolve-api"] },
  )(request);
  assert.deepEqual(receivedOptions.audience, ["sneaksolve-api"]);
});

test("bounds Clerk verification latency and fails closed", async () => {
  const never = new Promise(() => {});
  const client = clerkStub();
  client.authenticateRequest = () => never;

  await assert.rejects(
    authenticator(client, { timeoutMs: 5 })(request),
    (error) => error.status === 503 && error.code === "AUTH_SERVICE_TIMEOUT",
  );
});

test("bounds Clerk active-session lookup latency and fails closed", async () => {
  const client = clerkStub();
  client.sessions.getSession = () => new Promise(() => {});

  await assert.rejects(
    authenticator(client, { timeoutMs: 5 })(request),
    (error) => error.status === 503 && error.code === "AUTH_SERVICE_TIMEOUT",
  );
});

function testJwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
}
