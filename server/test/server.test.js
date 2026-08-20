import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import {
  createAccountAnalysisController,
  createConfig,
  createSnapGrokServer,
  publicMaintenanceDiagnostics,
  validateRuntimeConfig,
} from "../src/server.js";

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const WEBSITE_ORIGIN = "https://www.zenaian.com";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const PRIVACY_HMAC_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const DELETION_LEDGER_KEY = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const DELETION_LEDGER_URL =
  "postgresql://ledger_runtime:password@ledger-postgres/zenaian_deletions";

test("account deletion aborts legacy direct analysis and queued jobs", () => {
  const jobCalls = [];
  const controller = createAccountAnalysisController({
    cancelForUser(userId, reason) {
      jobCalls.push([userId, reason]);
      return 2;
    },
  });
  const first = new AbortController();
  const second = new AbortController();
  const other = new AbortController();
  controller.track("user_delete", first);
  controller.track("user_delete", second);
  controller.track("user_other", other);

  assert.equal(controller.cancelForUser("user_delete", "delete"), 4);
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.equal(other.signal.aborted, false);
  assert.deepEqual(jobCalls, [["user_delete", "delete"]]);
});

test("maintenance diagnostics retain safe SQLSTATE without database details", () => {
  assert.deepEqual(
    publicMaintenanceDiagnostics({
      diagnostics: [{
        stage: "payment",
        code: "BILLING_DATABASE_UNAVAILABLE",
        databaseCode: "22P02",
        message: "sensitive database detail",
      }],
    }),
    {
      diagnostics: [{
        stage: "payment",
        code: "BILLING_DATABASE_UNAVAILABLE",
        databaseCode: "22P02",
      }],
    },
  );
});

function testConfig() {
  return createConfig({
    CLERK_AUTHORIZED_PARTIES: EXTENSION_ORIGIN,
    ALLOWED_ORIGINS: EXTENSION_ORIGIN,
    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_MAX_REQUESTS: "20",
    MAX_CONCURRENT_REQUESTS_PER_USER: "2",
    MAX_REQUEST_MB: "1",
    MOCK_XAI: "true",
  });
}

async function withServer(options, run) {
  const server = createSnapGrokServer({
    config: testConfig(),
    authenticate: async () => ({ userId: "user_test", sessionId: "sess_test" }),
    analyze: async () => ({
      status: "answered",
      answers: ["A"],
      text: "status: answered\nanswers: A",
      model: "mock-xai",
    }),
    ...options,
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl, server);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health endpoint reveals no secret configuration", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("strict-transport-security"),
      "max-age=31536000; includeSubDomains",
    );
    assert.deepEqual(await response.json(), {
      ok: true,
      version: "6.2.0",
      service: "zenaian-api",
      authRequired: true,
      persistentRequestStorage: false,
      billingMode: "off",
      extensionDeviceAuth: false,
      privacyControls: false,
      privacyReady: false,
      maintenance: { status: "disabled" },
    });
  });
});

test("health becomes degraded after privacy maintenance fails", async () => {
  const maintenanceError = Object.assign(new Error("safe"), {
    code: "PRIVACY_MAINTENANCE_INCOMPLETE",
  });
  await withServer({
    privacy: {
      ready: true,
      async maintenance() { throw maintenanceError; },
    },
  }, async (baseUrl, server) => {
    await assert.rejects(server.runPrivacyMaintenance(), maintenanceError);
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.ok, false);
    assert.equal(payload.maintenance.status, "degraded");
    assert.equal(payload.maintenance.consecutiveFailures, 1);
    assert.match(payload.maintenance.lastAttemptAt, /^2026-|^202[7-9]-/);
    assert.equal(payload.maintenance.lastSuccessAt, null);
  });
});

test("health degrades for overdue or repeatedly partial deletions", async () => {
  await withServer({
    privacy: {
      ready: true,
      async maintenance() {
        return {
          deletionBacklog: {
            total: 2,
            due: 2,
            overdue: 1,
            repeatedlyPartial: 1,
            oldestCreatedAt: "2026-08-17T00:00:00.000Z",
            oldestAgeSeconds: 86_400,
          },
          zdrSafety: { state: "enabled", consecutiveFailures: 0 },
        };
      },
    },
  }, async (baseUrl, server) => {
    await server.runPrivacyMaintenance();
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.maintenance.status, "degraded");
    assert.equal(payload.maintenance.deletionBacklog.overdue, 1);
    assert.equal(payload.maintenance.deletionBacklog.repeatedlyPartial, 1);
  });
});

test("health exposes only a validated deployment revision", async () => {
  const config = testConfig();
  config.deploymentRevision = "8c71355d96426888679ccb038c5724535f501e63";
  await withServer({ config }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(
      (await response.json()).deploymentRevision,
      "8c71355d96426888679ccb038c5724535f501e63",
    );
  });
});

test("analyze rejects an origin outside the exact allowlist", async () => {
  let authenticateCalls = 0;
  await withServer(
    {
      authenticate: async () => {
        authenticateCalls += 1;
        return { userId: "user_test", sessionId: "sess_test" };
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        headers: {
          Origin: "chrome-extension://pppppppppppppppppppppppppppppppp",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validBody()),
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
      assert.equal(authenticateCalls, 0);
    },
  );
});

test("analyze requires an authenticated Clerk session", async () => {
  const authenticationError = Object.assign(new Error("Authentication required."), {
    status: 401,
    code: "AUTH_REQUIRED",
  });

  await withServer(
    { authenticate: async () => { throw authenticationError; } },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, requestOptions(validBody()));
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, "AUTH_REQUIRED");
    },
  );
});

test("analyze accepts a valid authenticated extension request", async () => {
  let authenticateCalls = 0;
  await withServer({
    authenticate: async () => {
      authenticateCalls += 1;
      return { userId: "user_test", sessionId: "sess_test" };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/analyze`, requestOptions(validBody()));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
    assert.deepEqual(await response.json(), {
      ok: true,
      status: "answered",
      answers: ["A"],
      text: "status: answered\nanswers: A",
      model: "mock-xai",
    });
    assert.equal(authenticateCalls, 2);
  });
});

test("privacy routes are website-only, authenticated, and require recent auth", async () => {
  const calls = [];
  const config = createConfig({
    CLERK_AUTHORIZED_PARTIES: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    ALLOWED_ORIGINS: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    WEBSITE_ORIGIN,
    MOCK_XAI: "true",
  });
  const privacy = {
    store: null,
    async exportData(userId) {
      calls.push(["export", userId]);
      return { requestId: "export_test" };
    },
    async deleteAccount(userId) {
      calls.push(["delete", userId]);
      return { requestId: "11111111-1111-4111-8111-111111111111", state: "complete" };
    },
    async assertUserAllowed() { return true; },
    async close() {},
  };
  await withServer({
    config,
    privacy,
    authenticate: async () => ({
      userId: "user_test",
      sessionId: "sess_test",
      factorVerificationAge: [0, -1],
    }),
  }, async (baseUrl) => {
    const headers = { Origin: WEBSITE_ORIGIN, Authorization: "Bearer test" };
    const exported = await fetch(`${baseUrl}/api/privacy/export`, { headers });
    assert.equal(exported.status, 200);
    assert.equal((await exported.json()).export.requestId, "export_test");

    const deleted = await fetch(`${baseUrl}/api/privacy/delete-account`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmImmediateLoss: true,
        confirmRenewalCancellation: true,
        confirmLegalRetention: true,
        confirmIrreversible: true,
        confirmText: "DELETE",
      }),
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(calls, [
      ["export", "user_test"],
      ["delete", "user_test"],
    ]);

    const wrongOrigin = await fetch(`${baseUrl}/api/privacy/export`, {
      headers: { ...headers, Origin: EXTENSION_ORIGIN },
    });
    assert.equal(wrongOrigin.status, 403);
  });

  await withServer({
    config,
    privacy,
    authenticate: async () => ({
      userId: "user_test",
      sessionId: "sess_test",
      factorVerificationAge: [11, -1],
    }),
  }, async (baseUrl) => {
    for (const pathname of ["/api/privacy/export"]) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        headers: { Origin: WEBSITE_ORIGIN, Authorization: "Bearer test" },
      });
      assert.equal(response.status, 401);
      const payload = await response.json();
      assert.equal(payload.code, "AUTH_REVERIFICATION_REQUIRED");
      assert.deepEqual(payload.reverification, {
        level: "first_factor",
        afterMinutes: 10,
      });
    }
  });
});

test("privacy failures return a route-specific message and log safe SQLSTATE", async () => {
  const config = createConfig({
    CLERK_AUTHORIZED_PARTIES: WEBSITE_ORIGIN,
    ALLOWED_ORIGINS: WEBSITE_ORIGIN,
    WEBSITE_ORIGIN,
    MOCK_XAI: "true",
  });
  const privacyError = Object.assign(new Error("sensitive database detail"), {
    status: 503,
    code: "PRIVACY_DATABASE_UNAVAILABLE",
    databaseCode: "42883",
  });
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (value) => logs.push(String(value));
  try {
    await withServer({
      config,
      privacy: {
        async exportData() { throw privacyError; },
        async assertUserAllowed() { return true; },
        async close() {},
      },
      authenticate: async () => ({
        userId: "user_test",
        sessionId: "sess_test",
        factorVerificationAge: [0, -1],
      }),
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/privacy/export`, {
        headers: {
          Origin: WEBSITE_ORIGIN,
          Authorization: "Bearer test",
        },
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "The privacy service is temporarily unavailable.",
        code: "PRIVACY_DATABASE_UNAVAILABLE",
        requestId: response.headers.get("x-request-id"),
      });
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(logs.length, 1);
  const diagnostic = JSON.parse(logs[0]);
  assert.equal(diagnostic.databaseCode, "42883");
  assert.equal("message" in diagnostic, false);
  assert.doesNotMatch(logs[0], /sensitive database detail/);
});

test("analysis forwards fail-closed ZDR policy to xAI", async () => {
  let receivedPolicy = null;
  const config = createConfig({
    ...baseEnvironment(),
    REQUIRE_XAI_ZDR: "true",
  });
  await withServer(
    {
      config,
      analyze: async ({ requireZeroDataRetention }) => {
        receivedPolicy = requireZeroDataRetention;
        return {
          status: "answered",
          answers: ["A"],
          text: "status: answered\nanswers: A",
          model: "mock-xai",
        };
      },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions(validBody()),
      );
      assert.equal(response.status, 200);
    },
  );
  assert.equal(receivedPolicy, true);
});

test("repeated ZDR failures disable subsequent production analysis", async () => {
  let analyzeCalls = 0;
  let failureCount = 0;
  let disabled = false;
  const zdrError = Object.assign(new Error("ZDR not confirmed"), {
    status: 502,
    code: "XAI_ZDR_REQUIRED",
  });
  await withServer({
    privacy: {
      async assertUserAllowed() { return true; },
      async assertAnalysisAllowed() {
        if (disabled) {
          throw Object.assign(new Error("disabled"), {
            status: 503,
            code: "ANALYSIS_DISABLED_ZDR",
          });
        }
      },
      async recordZdrFailure() {
        failureCount += 1;
        if (failureCount >= 3) disabled = true;
      },
      async recordZdrSuccess() { failureCount = 0; },
    },
    analyze: async () => {
      analyzeCalls += 1;
      throw zdrError;
    },
  }, async (baseUrl) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions(validBody()),
      );
      assert.equal(response.status, 502);
      assert.equal((await response.json()).code, "XAI_ZDR_REQUIRED");
    }
    const blocked = await fetch(
      `${baseUrl}/api/analyze`,
      requestOptions(validBody()),
    );
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).code, "ANALYSIS_DISABLED_ZDR");
  });
  assert.equal(analyzeCalls, 3);
  assert.equal(failureCount, 3);
});

test("website pairing and extension polling routes keep their authentication boundaries", async () => {
  const calls = [];
  let accountStatusUserId = "";
  const config = createConfig({
    ...baseEnvironment(),
    ALLOWED_ORIGINS: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    CLERK_AUTHORIZED_PARTIES: WEBSITE_ORIGIN,
    WEBSITE_ORIGIN,
  });
  const deviceSessions = {
    async createPairing(input) {
      calls.push(["pair", input]);
      return {
        pairingCode: `ssp_${"a".repeat(43)}`,
        expiresAt: "2026-08-01T00:02:00.000Z",
      };
    },
    async exchangePairing(input) {
      calls.push(["exchange", input]);
      return {
        accessToken: `ssv1.${"a".repeat(80)}.signature`,
        accessExpiresAt: "2026-08-01T00:15:00.000Z",
        refreshToken: `ssv1.${"b".repeat(80)}.signature`,
        refreshExpiresAt: "2026-09-01T00:00:00.000Z",
        profile: { accountId: "user_test", email: "test@example.com" },
      };
    },
    async authenticateAccess() {
      return {
        userId: "user_test",
        sessionId: "sess_test",
        deviceSessionId: "device-test",
      };
    },
    async refresh() { throw new Error("not used"); },
    async profile() { return { accountId: "user_test" }; },
    async revokeDeviceSession() { return 1; },
    async revokeUserSessions() { return 1; },
    async maintenance() {},
    async close() {},
  };
  const analysisJobs = {
    async create() {
      return {
        jobId: "22222222-2222-4222-8222-222222222222",
        status: "processing",
        pollAfterMs: 750,
        expiresAt: "2026-08-01T00:02:00.000Z",
      };
    },
    get() {
      return {
        httpStatus: 200,
        payload: { ok: true, status: "answered", answers: ["A"] },
      };
    },
    cancel() { return { cancelled: true }; },
    cancelForUser() { return 0; },
    cancelForDevice() { return 0; },
    cleanup() {},
    close() {},
  };

  await withServer(
    {
      config,
      deviceSessions,
      analysisJobs,
      billing: billingStub({
        status: async (userId) => {
          accountStatusUserId = userId;
          return {
            billingEnabled: true,
            mode: "test",
            plan: { id: "free", allowance: 5, cadence: "day" },
            usage: {
              allowance: 5,
              consumed: 1,
              reserved: 1,
              remaining: 3,
              resetsAt: "2026-08-02T00:00:00.000Z",
            },
            subscription: { provider: "private-provider-detail" },
          };
        },
      }),
      authenticate: async () => ({ userId: "user_test", sessionId: "sess_test" }),
    },
    async (baseUrl) => {
      const nonce = "n".repeat(43);
      const pairing = await fetch(`${baseUrl}/api/extension/pairings`, {
        method: "POST",
        headers: {
          Origin: WEBSITE_ORIGIN,
          Authorization: "Bearer clerk-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          extensionId: "abcdefghijklmnopabcdefghijklmnop",
          nonce,
        }),
      });
      assert.equal(pairing.status, 201);

      const exchange = await fetch(`${baseUrl}/api/extension/pairings/exchange`, {
        method: "POST",
        headers: {
          Origin: EXTENSION_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pairingCode: `ssp_${"a".repeat(43)}`, nonce }),
      });
      assert.equal(exchange.status, 200);

      const verified = await fetch(`${baseUrl}/api/extension/session/verify`, {
        method: "POST",
        headers: {
          Origin: EXTENSION_ORIGIN,
          Authorization: "Bearer device-token",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(verified.status, 200);
      assert.equal((await verified.json()).profile.accountId, "user_test");

      const accountStatus = await fetch(
        `${baseUrl}/api/extension/account/status`,
        {
          headers: {
            Origin: EXTENSION_ORIGIN,
            Authorization: "Bearer device-token",
          },
        },
      );
      assert.equal(accountStatus.status, 200);
      assert.deepEqual(await accountStatus.json(), {
        ok: true,
        plan: { id: "free" },
        usage: { allowance: 5, remaining: 3 },
      });
      assert.equal(accountStatusUserId, "user_test");

      const job = await fetch(`${baseUrl}/api/analyze-jobs`, {
        method: "POST",
        headers: {
          Origin: EXTENSION_ORIGIN,
          Authorization: "Bearer device-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...validBody(), operationId: OPERATION_ID }),
      });
      assert.equal(job.status, 202);
      const polled = await fetch(
        `${baseUrl}/api/analyze-jobs/22222222-2222-4222-8222-222222222222/poll`,
        {
          method: "POST",
          headers: {
            Origin: EXTENSION_ORIGIN,
            Authorization: "Bearer device-token",
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      assert.equal(polled.status, 200);
      assert.deepEqual((await polled.json()).answers, ["A"]);

      const cancelled = await fetch(
        `${baseUrl}/api/analyze-jobs/22222222-2222-4222-8222-222222222222/cancel`,
        {
          method: "POST",
          headers: {
            Origin: EXTENSION_ORIGIN,
            Authorization: "Bearer device-token",
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      assert.equal(cancelled.status, 200);
      assert.equal((await cancelled.json()).cancelled, true);
      assert.deepEqual(calls.map(([name]) => name), ["pair", "exchange"]);
    },
  );
});

test("billing status is authenticated and available to the website origin", async () => {
  let statusUserId = "";
  await withServer(
    {
      config: billingRouteConfig(),
      billing: billingStub({
        status: async (userId) => {
          statusUserId = userId;
          return {
            billingEnabled: true,
            mode: "test",
            plan: { id: "free", allowance: 5, cadence: "day" },
            usage: {
              allowance: 5,
              consumed: 1,
              reserved: 0,
              remaining: 4,
              resetsAt: "2026-07-28T00:00:00.000Z",
            },
            subscription: null,
          };
        },
      }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/status`, {
        headers: {
          Origin: WEBSITE_ORIGIN,
          Authorization: "Bearer test-token",
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), WEBSITE_ORIGIN);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.plan.id, "free");
      assert.equal(payload.usage.remaining, 4);
      assert.equal(statusUserId, "user_test");
    },
  );
});

test("payment history is authenticated and restricted to the website origin", async () => {
  let historyUserId = "";
  await withServer(
    {
      config: billingRouteConfig(),
      billing: billingStub({
        paymentHistory: async (userId) => {
          historyUserId = userId;
          return {
            billingEnabled: true,
            payments: [{
              reference: "ment123456",
              planId: "plus",
              status: "paid",
              providerSubstatus: "succeeded",
              paidAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
            }],
          };
        },
      }),
    },
    async (baseUrl) => {
      const blocked = await fetch(`${baseUrl}/api/billing/history`, {
        headers: {
          Origin: EXTENSION_ORIGIN,
          Authorization: "Bearer test-token",
        },
      });
      assert.equal(blocked.status, 403);
      assert.equal((await blocked.json()).code, "BILLING_ORIGIN_NOT_ALLOWED");

      const response = await fetch(`${baseUrl}/api/billing/history`, {
        headers: {
          Origin: WEBSITE_ORIGIN,
          Authorization: "Bearer test-token",
        },
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(historyUserId, "user_test");
      assert.equal(payload.payments[0].reference, "ment123456");
    },
  );
});

test("checkout is rejected from the extension even though its origin is API-allowed", async () => {
  let checkoutCalls = 0;
  await withServer(
    {
      config: billingRouteConfig(),
      billing: billingStub({
        createCheckout: async () => {
          checkoutCalls += 1;
          return { url: "https://sandbox.whop.com/checkout/example" };
        },
      }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          Origin: EXTENSION_ORIGIN,
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: "plus" }),
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "BILLING_ORIGIN_NOT_ALLOWED");
      assert.equal(checkoutCalls, 0);
    },
  );
});

test("billing cancellation is authenticated, website-only, and server-side", async () => {
  let cancellationUserId = "";
  let cancellationPlan = "";
  await withServer(
    {
      config: billingRouteConfig(),
      billing: billingStub({
        cancelMembership: async ({ userId, planId }) => {
          cancellationUserId = userId;
          cancellationPlan = planId;
          return {
            cancelAtPeriodEnd: true,
            endsAt: "2026-08-27T12:00:00.000Z",
          };
        },
      }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/cancel`, {
        method: "POST",
        headers: {
          Origin: WEBSITE_ORIGIN,
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: "plus" }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.cancelAtPeriodEnd, true);
      assert.equal(cancellationUserId, "user_test");
      assert.equal(cancellationPlan, "plus");
    },
  );
});

test("renewal reactivation is authenticated, website-only, and plan-scoped", async () => {
  let input;
  await withServer(
    {
      config: billingRouteConfig(),
      billing: billingStub({
        reactivateMembership: async (value) => {
          input = value;
          return {
            planId: value.planId,
            cancelAtPeriodEnd: false,
            renewsAt: "2026-08-27T12:00:00.000Z",
          };
        },
      }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/reactivate`, {
        method: "POST",
        headers: {
          Origin: WEBSITE_ORIGIN,
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: "ultra" }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(input, { userId: "user_test", planId: "ultra" });
      assert.equal((await response.json()).cancelAtPeriodEnd, false);
    },
  );
});

test("Whop webhook route requires and forwards all Standard Webhooks headers", async () => {
  let received;
  await withServer(
    {
      config: billingRouteConfig(),
      billing: billingStub({
        handleWebhook: async (input) => {
          received = input;
          return { accepted: true, duplicate: false, applied: false };
        },
      }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "webhook-id": "msg_webhook123456",
          "webhook-timestamp": "1785153600",
          "webhook-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        },
        body: '{"type":"membership.activated"}',
      });
      assert.equal(response.status, 200);
      assert.equal(received.webhookId, "msg_webhook123456");
      assert.equal(received.webhookTimestamp, "1785153600");
      assert.match(received.webhookSignature, /^v1,/);
      assert.equal(received.rawBody.toString("utf8"), '{"type":"membership.activated"}');
    },
  );
});

test("analyze reserves and consumes exactly one quota operation", async () => {
  const calls = [];
  await withServer(
    {
      billing: billingStub({
        reserveAnalysis: async (input) => {
          calls.push(["reserve", input]);
          return {
            allowed: true,
            model: "grok-4.5",
            reservation: { operationId: input.operationId },
          };
        },
        consumeAnalysis: async (input) => {
          calls.push(["consume", input]);
          return true;
        },
        releaseAnalysis: async (input) => {
          calls.push(["release", input]);
          return true;
        },
      }),
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions({ ...validBody(), operationId: OPERATION_ID }),
      );
      assert.equal(response.status, 200);
    },
  );

  assert.deepEqual(calls.map(([name]) => name), ["reserve", "consume"]);
  assert.equal(calls[0][1].operationId, OPERATION_ID);
  assert.equal(calls[0][1].userId, "user_test");
  assert.equal(calls[1][1].reservation.operationId, OPERATION_ID);
});

test("analyze releases a reserved quota operation when ZDR is not confirmed", async () => {
  const calls = [];
  const upstreamError = Object.assign(new Error("ZDR not confirmed"), {
    status: 502,
    code: "XAI_ZDR_REQUIRED",
  });
  await withServer(
    {
      billing: billingStub({
        reserveAnalysis: async (input) => {
          calls.push(["reserve", input]);
          return {
            allowed: true,
            model: "grok-4.5",
            reservation: { operationId: input.operationId },
          };
        },
        consumeAnalysis: async (input) => {
          calls.push(["consume", input]);
        },
        releaseAnalysis: async (input) => {
          calls.push(["release", input]);
          return true;
        },
      }),
      analyze: async () => {
        throw upstreamError;
      },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions({ ...validBody(), operationId: OPERATION_ID }),
      );
      assert.equal(response.status, 502);
      assert.equal((await response.json()).code, "XAI_ZDR_REQUIRED");
    },
  );

  assert.deepEqual(calls.map(([name]) => name), ["reserve", "release"]);
  assert.equal(calls[1][1].reservation.operationId, OPERATION_ID);
});

test("quota exhaustion is returned without calling xAI", async () => {
  let analyzeCalls = 0;
  const quotaError = Object.assign(
    new Error("Your plan quota has been reached."),
    {
      status: 429,
      code: "QUOTA_EXHAUSTED",
      quota: {
        planId: "free",
        allowance: 5,
        used: 5,
        reserved: 0,
        resetsAt: new Date("2026-07-28T00:00:00.000Z"),
      },
    },
  );
  await withServer(
    {
      billing: billingStub({
        reserveAnalysis: async () => {
          throw quotaError;
        },
      }),
      analyze: async () => {
        analyzeCalls += 1;
      },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions({ ...validBody(), operationId: OPERATION_ID }),
      );
      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "Your plan quota has been reached.",
        code: "QUOTA_EXHAUSTED",
        requestId: response.headers.get("x-request-id"),
        quota: {
          plan: "free",
          allowance: 5,
          used: 5,
          reserved: 0,
          resetsAt: "2026-07-28T00:00:00.000Z",
        },
      });
      assert.equal(analyzeCalls, 0);
    },
  );
});

test("analyze accepts empty or omitted optional context", async () => {
  const receivedInstructions = [];

  await withServer(
    {
      analyze: async ({ instruction }) => {
        receivedInstructions.push(instruction);
        return {
          status: "answered",
          answers: ["A"],
          text: "status: answered\nanswers: A",
          model: "mock-xai",
        };
      },
    },
    async (baseUrl) => {
      const emptyContext = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions({ ...validBody(), instruction: "" }),
      );
      assert.equal(emptyContext.status, 200);

      const omittedContextBody = validBody();
      delete omittedContextBody.instruction;
      const omittedContext = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions(omittedContextBody),
      );
      assert.equal(omittedContext.status, 200);
    },
  );

  assert.deepEqual(receivedInstructions, ["", ""]);
});

test("analyze rejects a non-string optional context", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/analyze`,
      requestOptions({ ...validBody(), instruction: null }),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_INSTRUCTION");
  });
});

test("runtime configuration rejects wildcard or path-based origins", () => {
  const base = {
    CLERK_SECRET_KEY: "sk_test_stub",
    CLERK_PUBLISHABLE_KEY: "pk_test_stub",
    MOCK_XAI: "true",
  };

  assert.throws(
    () => validateRuntimeConfig(createConfig({
      ...base,
      ALLOWED_ORIGINS: "*",
      CLERK_AUTHORIZED_PARTIES: "*",
    })),
    /invalid origin/,
  );
  assert.throws(
    () => validateRuntimeConfig(createConfig({
      ...base,
      ALLOWED_ORIGINS: "https://zenaian.com/account",
      CLERK_AUTHORIZED_PARTIES: EXTENSION_ORIGIN,
    })),
    /invalid origin/,
  );
});

test("runtime configuration can require production Clerk credentials", () => {
  const base = {
    ALLOWED_ORIGINS: EXTENSION_ORIGIN,
    CLERK_AUTHORIZED_PARTIES: EXTENSION_ORIGIN,
    MOCK_XAI: "false",
    XAI_API_KEY: "xai-test-key",
    REQUIRE_PRODUCTION_CLERK: "true",
  };

  assert.throws(
    () => validateRuntimeConfig(createConfig({
      ...base,
      CLERK_SECRET_KEY: "sk_test_stub",
      CLERK_PUBLISHABLE_KEY: "pk_test_stub",
    })),
    /requires matching sk_live_ and pk_live_/,
  );

  assert.doesNotThrow(
    () => validateRuntimeConfig(createConfig({
      ...base,
      CLERK_SECRET_KEY: "sk_live_stub",
      CLERK_PUBLISHABLE_KEY: "pk_live_stub",
    })),
  );
});

test("analyze withholds a result if the session ends during analysis", async () => {
  let authenticateCalls = 0;
  await withServer(
    {
      authenticate: async () => {
        authenticateCalls += 1;
        if (authenticateCalls === 2) {
          throw Object.assign(new Error("Your session is no longer active."), {
            status: 401,
            code: "AUTH_SESSION_INACTIVE",
          });
        }
        return { userId: "user_test", sessionId: "sess_test" };
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, requestOptions(validBody()));
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, "AUTH_SESSION_INACTIVE");
    },
  );
});

test("analyze cancels downstream work when the extension disconnects", async () => {
  let analysisStarted;
  const started = new Promise((resolve) => { analysisStarted = resolve; });
  let downstreamAborted = false;

  await withServer(
    {
      analyze: async ({ signal }) => {
        analysisStarted();
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            downstreamAborted = true;
            reject(signal.reason);
          }, { once: true });
        });
      },
    },
    async (baseUrl) => {
      const controller = new AbortController();
      const pending = fetch(`${baseUrl}/api/analyze`, {
        ...requestOptions(validBody()),
        signal: controller.signal,
      });

      await started;
      controller.abort();
      await assert.rejects(pending, (error) => error.name === "AbortError");
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(downstreamAborted, true);
    },
  );
});

test("analyze rejects unsupported image data URLs", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/analyze`,
      requestOptions({ ...validBody(), imageDataUrl: "data:image/svg+xml;base64,AA==" }),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_IMAGE");
  });
});

test("analyze rejects spoofed image MIME data before xAI", async () => {
  let analyzeCalls = 0;
  await withServer(
    { analyze: async () => { analyzeCalls += 1; } },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions({
          ...validBody(),
          imageDataUrl: "data:image/png;base64,QUFBQQ==",
        }),
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "INVALID_IMAGE");
      assert.equal(analyzeCalls, 0);
    },
  );
});

test("analyze bounds shortcut names before xAI", async () => {
  let analyzeCalls = 0;
  await withServer(
    {
      config: createConfig({
        ...baseEnvironment(),
        MAX_SHORTCUT_NAME_CHARACTERS: "10",
      }),
      analyze: async () => { analyzeCalls += 1; },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions({ ...validBody(), shortcutName: "x".repeat(11) }),
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "SHORTCUT_NAME_TOO_LONG");
      assert.equal(analyzeCalls, 0);
    },
  );
});

test("global admission control runs before authentication", async () => {
  const authError = Object.assign(new Error("Authentication required."), {
    status: 401,
    code: "AUTH_REQUIRED",
  });
  let authenticationCalls = 0;
  await withServer(
    {
      config: createConfig({
        ...baseEnvironment(),
        GLOBAL_RATE_LIMIT_MAX_REQUESTS: "1",
      }),
      authenticate: async () => {
        authenticationCalls += 1;
        throw authError;
      },
    },
    async (baseUrl) => {
      const first = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions(validBody()),
      );
      assert.equal(first.status, 401);

      const second = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions(validBody()),
      );
      assert.equal(second.status, 429);
      assert.equal((await second.json()).code, "GLOBAL_RATE_LIMITED");
      assert.equal(authenticationCalls, 1);
    },
  );
});

test("analysis model is selected by the server-side access policy", async () => {
  let receivedModel;
  await withServer(
    {
      resolveAnalysisAccess: async () => ({ allowed: true, model: "mock-xai" }),
      config: createConfig({
        ...baseEnvironment(),
        XAI_MODEL: "mock-xai",
        ALLOWED_XAI_MODELS: "mock-xai",
      }),
      analyze: async ({ model }) => {
        receivedModel = model;
        return {
          status: "answered",
          answers: ["A"],
          text: "status: answered\nanswers: A",
          model,
        };
      },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions({ ...validBody(), model: "attacker-selected-model" }),
      );
      assert.equal(response.status, 200);
      assert.equal(receivedModel, "mock-xai");
    },
  );
});

test("analysis access policy fails closed on unsupported models", async () => {
  let analyzeCalls = 0;
  await withServer(
    {
      resolveAnalysisAccess: async () => ({
        allowed: true,
        model: "not-allowlisted",
      }),
      analyze: async () => { analyzeCalls += 1; },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions(validBody()),
      );
      assert.equal(response.status, 500);
      assert.equal((await response.json()).code, "ANALYSIS_ACCESS_INVALID");
      assert.equal(analyzeCalls, 0);
    },
  );
});

test("server redacts upstream error details from clients", async () => {
  const upstreamError = Object.assign(
    new Error("provider credential detail must never reach the extension"),
    { status: 502, code: "XAI_CREDENTIALS_REJECTED" },
  );
  await withServer(
    { analyze: async () => { throw upstreamError; } },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/analyze`,
        requestOptions(validBody()),
      );
      const payload = await response.json();
      assert.equal(response.status, 502);
      assert.equal(payload.code, "XAI_CREDENTIALS_REJECTED");
      assert.equal(payload.error, "The analysis service is temporarily unavailable.");
      assert.doesNotMatch(JSON.stringify(payload), /credential detail/);
    },
  );
});

test("security-sensitive configuration fails closed on typos", () => {
  assert.throws(
    () => createConfig({ REQUIRE_ALLOWED_ORIGIN: "ture" }),
    /REQUIRE_ALLOWED_ORIGIN must be true or false/,
  );
  assert.throws(
    () => createConfig({ REQUIRE_XAI_ZDR: "ture" }),
    /REQUIRE_XAI_ZDR must be true or false/,
  );
  assert.throws(
    () => createConfig({ MAX_REQUEST_MB: "999" }),
    /MAX_REQUEST_MB must be an integer/,
  );
});

test("production configuration forbids mock inference and HTTP origins", () => {
  const productionBase = {
    ...baseEnvironment(),
    CLERK_SECRET_KEY: "sk_live_stub",
    CLERK_PUBLISHABLE_KEY: "pk_live_stub",
    REQUIRE_PRODUCTION_CLERK: "true",
    XAI_API_KEY: "xai-test-key",
    MOCK_XAI: "false",
  };

  assert.throws(
    () => validateRuntimeConfig(createConfig({
      ...productionBase,
      MOCK_XAI: "true",
    })),
    /MOCK_XAI cannot be enabled/,
  );
  assert.throws(
    () => validateRuntimeConfig(createConfig({
      ...productionBase,
      ALLOWED_ORIGINS: "http://localhost:3000",
      CLERK_AUTHORIZED_PARTIES: "http://localhost:3000",
    })),
    /cannot contain HTTP origins in production/,
  );
});

test("NODE_ENV=production enables production Clerk enforcement by default", () => {
  const config = createConfig({
    ...baseEnvironment(),
    NODE_ENV: "production",
    CLERK_SECRET_KEY: "sk_test_stub",
    CLERK_PUBLISHABLE_KEY: "pk_test_stub",
  });
  assert.equal(config.requireProductionClerk, true);
  assert.equal(config.requireXaiZdr, true);
  assert.throws(
    () => validateRuntimeConfig(config),
    /requires matching sk_live_ and pk_live_/,
  );
});

test("production ZDR enforcement cannot be disabled by an environment override", () => {
  const config = createConfig({
    NODE_ENV: "production",
    REQUIRE_XAI_ZDR: "false",
  });
  assert.equal(config.requireXaiZdr, true);
  assert.equal(
    createConfig({ REQUIRE_XAI_ZDR: "true" }).requireXaiZdr,
    true,
  );
  assert.equal(
    createConfig({ REQUIRE_XAI_ZDR: "false" }).requireXaiZdr,
    false,
  );
});

test("the supplied Whop sandbox identifiers pass fail-closed configuration", () => {
  const config = createConfig({
    NODE_ENV: "production",
    XAI_API_KEY: "xai-test-placeholder",
    XAI_MODEL: "grok-4.5",
    ALLOWED_XAI_MODELS: "grok-4.3,grok-4.5",
    MOCK_XAI: "false",
    CLERK_SECRET_KEY: "sk_live_placeholder",
    CLERK_PUBLISHABLE_KEY: "pk_live_placeholder",
    REQUIRE_PRODUCTION_CLERK: "true",
    ALLOWED_ORIGINS: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    CLERK_AUTHORIZED_PARTIES: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    REQUIRE_ALLOWED_ORIGIN: "true",
    ENABLE_EXTENSION_DEVICE_AUTH: "false",
    BILLING_MODE: "test",
    BILLING_TESTER_USER_IDS:
      "user_SyntheticBillingTester0001,user_SyntheticBillingOther0002",
    BILLING_WEBSITE_ORIGIN: WEBSITE_ORIGIN,
    DATABASE_URL:
      "postgresql://sneaksolve:password@internal-postgres/sneaksolve",
    WHOP_API_KEY: "sandbox_api_key_placeholder_value",
    WHOP_WEBHOOK_SECRET: "whop_sandbox_webhook_secret_0123456789",
    WHOP_COMPANY_ID: "biz_745hMbzbWHtrZr",
    WHOP_PLUS_PLAN_ID: "plan_QzpD3pxTswPLX",
    WHOP_PLUS_PRODUCT_ID: "prod_M3Wts8bsfX4mK",
    WHOP_ULTRA_PLAN_ID: "plan_FZknYvJ1uz41F",
    WHOP_ULTRA_PRODUCT_ID: "prod_kIiWFLHOWhrWa",
    PRIVACY_ARCHIVE_HMAC_KEY: PRIVACY_HMAC_KEY,
    PRIVACY_DELETION_LEDGER_DATABASE_URL: DELETION_LEDGER_URL,
    PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY: DELETION_LEDGER_KEY,
  });

  assert.doesNotThrow(() => validateRuntimeConfig(config));
  assert.equal(config.whopCompanyId, "biz_745hMbzbWHtrZr");
  assert.equal(config.whopPlusPlanId, "plan_QzpD3pxTswPLX");
  assert.equal(config.whopUltraPlanId, "plan_FZknYvJ1uz41F");
  assert.equal(config.billingTesterUserIds.size, 2);
});

test("the supplied Whop production catalog passes fail-closed configuration", () => {
  const config = createConfig({
    NODE_ENV: "production",
    XAI_API_KEY: "xai-test-placeholder",
    XAI_MODEL: "grok-4.5",
    ALLOWED_XAI_MODELS: "grok-4.3,grok-4.5",
    MOCK_XAI: "false",
    CLERK_SECRET_KEY: "sk_live_placeholder",
    CLERK_PUBLISHABLE_KEY: "pk_live_placeholder",
    REQUIRE_PRODUCTION_CLERK: "true",
    ALLOWED_ORIGINS: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    CLERK_AUTHORIZED_PARTIES: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    REQUIRE_ALLOWED_ORIGIN: "true",
    ENABLE_EXTENSION_DEVICE_AUTH: "false",
    BILLING_MODE: "live",
    BILLING_WEBSITE_ORIGIN: WEBSITE_ORIGIN,
    DATABASE_URL:
      "postgresql://sneaksolve:password@internal-postgres/sneaksolve",
    WHOP_API_KEY: "production_api_key_placeholder_value",
    WHOP_WEBHOOK_SECRET: "whop_production_webhook_secret_0123456789",
    WHOP_COMPANY_ID: "biz_qeX3BGv4EvXBvF",
    WHOP_PLUS_PLAN_ID: "plan_3jbpTMP6hyNDa",
    WHOP_PLUS_LEGACY_PLAN_IDS: "plan_OFBOhk4mPJkao",
    WHOP_PLUS_PRODUCT_ID: "prod_KJzTb3dCClstC",
    WHOP_ULTRA_PLAN_ID: "plan_SvhZMoRlUNrmd",
    WHOP_ULTRA_LEGACY_PLAN_IDS: "plan_nqzuo5pPp6Y5w",
    WHOP_ULTRA_PRODUCT_ID: "prod_GgHJFkbBs2hLQ",
    PRIVACY_ARCHIVE_HMAC_KEY: PRIVACY_HMAC_KEY,
    PRIVACY_DELETION_LEDGER_DATABASE_URL: DELETION_LEDGER_URL,
    PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY: DELETION_LEDGER_KEY,
  });

  assert.doesNotThrow(() => validateRuntimeConfig(config));
  assert.equal(config.billingMode, "live");
  assert.equal(config.whopCompanyId, "biz_qeX3BGv4EvXBvF");
  assert.equal(config.whopPlusPlanId, "plan_3jbpTMP6hyNDa");
  assert.deepEqual([...config.whopPlusLegacyPlanIds], ["plan_OFBOhk4mPJkao"]);
  assert.equal(config.whopUltraPlanId, "plan_SvhZMoRlUNrmd");
  assert.deepEqual([...config.whopUltraLegacyPlanIds], ["plan_nqzuo5pPp6Y5w"]);
});

test("Whop legacy plan allowlists reject collisions and malformed IDs", () => {
  const environment = {
    NODE_ENV: "production",
    XAI_API_KEY: "xai-test-placeholder",
    XAI_MODEL: "grok-4.5",
    ALLOWED_XAI_MODELS: "grok-4.3,grok-4.5",
    MOCK_XAI: "false",
    CLERK_SECRET_KEY: "sk_live_placeholder",
    CLERK_PUBLISHABLE_KEY: "pk_live_placeholder",
    REQUIRE_PRODUCTION_CLERK: "true",
    ALLOWED_ORIGINS: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    CLERK_AUTHORIZED_PARTIES: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    REQUIRE_ALLOWED_ORIGIN: "true",
    ENABLE_EXTENSION_DEVICE_AUTH: "false",
    BILLING_MODE: "live",
    BILLING_WEBSITE_ORIGIN: WEBSITE_ORIGIN,
    DATABASE_URL: "postgresql://sneaksolve:password@internal-postgres/sneaksolve",
    WHOP_API_KEY: "production_api_key_placeholder_value",
    WHOP_WEBHOOK_SECRET: "whop_production_webhook_secret_0123456789",
    WHOP_COMPANY_ID: "biz_qeX3BGv4EvXBvF",
    WHOP_PLUS_PLAN_ID: "plan_3jbpTMP6hyNDa",
    WHOP_PLUS_PRODUCT_ID: "prod_KJzTb3dCClstC",
    WHOP_ULTRA_PLAN_ID: "plan_SvhZMoRlUNrmd",
    WHOP_ULTRA_PRODUCT_ID: "prod_GgHJFkbBs2hLQ",
    PRIVACY_ARCHIVE_HMAC_KEY: PRIVACY_HMAC_KEY,
    PRIVACY_DELETION_LEDGER_DATABASE_URL: DELETION_LEDGER_URL,
    PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY: DELETION_LEDGER_KEY,
  };
  assert.throws(
    () => validateRuntimeConfig(createConfig({
      ...environment,
      WHOP_PLUS_LEGACY_PLAN_IDS: "plan_SvhZMoRlUNrmd",
    })),
    /unique valid current\/legacy plan IDs/,
  );
  assert.throws(
    () => validateRuntimeConfig(createConfig({
      ...environment,
      WHOP_PLUS_LEGACY_PLAN_IDS: "not-a-plan",
    })),
    /unique valid current\/legacy plan IDs/,
  );
});

function requestOptions(body) {
  return {
    method: "POST",
    headers: {
      Origin: EXTENSION_ORIGIN,
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function validBody() {
  return {
    imageDataUrl: "data:image/jpeg;base64,/9j/2Q==",
    instruction: "Return the correct option.",
  };
}

function baseEnvironment() {
  return {
    CLERK_AUTHORIZED_PARTIES: EXTENSION_ORIGIN,
    ALLOWED_ORIGINS: EXTENSION_ORIGIN,
    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_MAX_REQUESTS: "20",
    MAX_CONCURRENT_REQUESTS_PER_USER: "2",
    MAX_REQUEST_MB: "1",
    MOCK_XAI: "true",
  };
}

function billingRouteConfig() {
  return createConfig({
    ...baseEnvironment(),
    ALLOWED_ORIGINS: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    CLERK_AUTHORIZED_PARTIES: `${EXTENSION_ORIGIN},${WEBSITE_ORIGIN}`,
    BILLING_WEBSITE_ORIGIN: WEBSITE_ORIGIN,
  });
}

function billingStub(overrides = {}) {
  return {
    async initialize() {},
    async close() {},
    async maintenance() {},
    async status() {
      return {
        billingEnabled: false,
        mode: "legacy",
        plan: null,
        usage: null,
        subscription: null,
      };
    },
    async paymentHistory() {
      return { billingEnabled: false, payments: [] };
    },
    async reserveAnalysis({ defaultModel }) {
      return {
        allowed: true,
        model: defaultModel,
        reservation: null,
        planId: "legacy",
      };
    },
    async consumeAnalysis() {},
    async releaseAnalysis() {},
    async createCheckout() {
      throw new Error("not implemented");
    },
    async cancelMembership() {
      throw new Error("not implemented");
    },
    async reactivateMembership() {
      throw new Error("not implemented");
    },
    async handleWebhook() {
      throw new Error("not implemented");
    },
    ...overrides,
  };
}
