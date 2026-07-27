import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import {
  createConfig,
  createSnapGrokServer,
  validateRuntimeConfig,
} from "../src/server.js";

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

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
    await run(baseUrl);
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
      version: "5.2.0",
      service: "sneaksolve-api",
      authRequired: true,
      persistentRequestStorage: false,
    });
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
      ALLOWED_ORIGINS: "https://sneaksolve.com/account",
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
  assert.throws(
    () => validateRuntimeConfig(config),
    /requires matching sk_live_ and pk_live_/,
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
