"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const AUTH_SOURCE = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");

test("verified auth snapshot returns plan and remaining question allowance", async () => {
  const requests = [];
  const { auth } = createAuthContext(async (url, init) => {
    requests.push({ url, init });
    return jsonResponse({
      ok: true,
      profile: {
        accountId: "user_12345",
        email: "member@example.com",
        displayName: "Member",
      },
      plan: { id: "plus" },
      usage: { allowance: 5, remaining: 3 },
    });
  });

  const snapshot = await auth.getAuthSnapshot();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.example.test/api/extension/session/verify");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(plain(snapshot.accountStatus), {
    planId: "plus",
    allowance: 5,
    remaining: 3,
  });
});

test("account status falls back to its validated cache without a second API route", async () => {
  let requestCount = 0;
  const { auth } = createAuthContext(async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return jsonResponse({
        ok: true,
        profile: {
          accountId: "user_12345",
          email: "member@example.com",
          displayName: "Member",
        },
        plan: { id: "ultra" },
        usage: { allowance: 20, remaining: 14 },
      });
    }
    throw new TypeError("network unavailable");
  });

  await auth.getAuthSnapshot();
  const status = await auth.getAccountStatus();

  assert.equal(requestCount, 2);
  assert.deepEqual(plain(status), {
    planId: "ultra",
    allowance: 20,
    remaining: 14,
  });
});

function createAuthContext(fetchImpl) {
  const local = createStorageArea({
    sneaksolveDeviceSessionV1: {
      version: 1,
      accessToken: "ssv1.access.signature",
      accessExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      refreshToken: "ssv1.refresh.signature",
      refreshExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      profile: {
        accountId: "user_12345",
        email: "member@example.com",
        displayName: "Member",
      },
    },
  });
  local.setAccessLevel = async () => {};

  const context = {
    SnapGrokAuthConfig: { serverUrl: "https://api.example.test" },
    URL,
    btoa,
    chrome: {
      runtime: {
        getURL: () => "chrome-extension://test-extension/",
        id: "test-extension",
      },
      storage: {
        local,
        session: createStorageArea(),
      },
    },
    console,
    crypto,
    fetch: fetchImpl,
    self: {},
  };

  vm.runInNewContext(AUTH_SOURCE, context, { filename: "auth.js" });
  return { auth: context.self.SnapGrokAuth };
}

function createStorageArea(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.map((key) => [key, values.get(key)]));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    },
    async set(next) {
      for (const [key, value] of Object.entries(next)) values.set(key, value);
    },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
