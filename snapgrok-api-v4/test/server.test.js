import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createConfig, createSnapGrokServer } from "../src/server.js";

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

function testConfig() {
  return createConfig({
    CLERK_AUTHORIZED_PARTIES: EXTENSION_ORIGIN,
    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_MAX_REQUESTS: "20",
    RATE_LIMIT_MAX_CONCURRENT: "2",
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
    assert.deepEqual(await response.json(), {
      ok: true,
      version: "4.0.0",
      service: "snapgrok-api",
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
  await withServer({}, async (baseUrl) => {
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
  });
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
    imageDataUrl: "data:image/jpeg;base64,AA==",
    instruction: "Return the correct option.",
  };
}
