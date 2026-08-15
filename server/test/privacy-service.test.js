import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrivacyService,
  requireRecentAuthentication,
  validateDeletionConfirmation,
} from "../src/privacy-service.js";

const USER_ID = "user_PrivacyTester123";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-15T00:00:00.000Z");

test("recent-authentication enforcement accepts only a fresh first factor", () => {
  assert.equal(
    requireRecentAuthentication({ factorVerificationAge: [0, -1] }),
    true,
  );
  assert.equal(
    requireRecentAuthentication({ factorVerificationAge: [10, 3] }),
    true,
  );

  for (const factorVerificationAge of [
    null,
    [],
    [11, 0],
    [-1, -1],
    [Number.NaN, 0],
  ]) {
    assert.throws(
      () => requireRecentAuthentication({ factorVerificationAge }),
      reauthenticationRequired,
    );
  }
});

test("deletion confirmation requires the exact schema and literal DELETE", () => {
  const valid = deletionConfirmation();
  assert.equal(validateDeletionConfirmation(valid), undefined);

  for (const invalid of [
    { ...valid, confirmText: "delete" },
    { ...valid, confirmImmediateLoss: false },
    { ...valid, reason: "not accepted" },
    Object.fromEntries(
      Object.entries(valid).filter(([key]) => key !== "confirmLegalRetention"),
    ),
    [],
    null,
  ]) {
    assert.throws(
      () => validateDeletionConfirmation(invalid),
      deletionConfirmationInvalid,
    );
  }
});

test("privacy startup validates storage without making maintenance a fatal gate", async () => {
  const calls = [];
  const databaseFailure = Object.assign(new Error("safe"), {
    code: "PRIVACY_DATABASE_UNAVAILABLE",
    databaseCode: "42501",
  });
  const store = {
    async initialize() {
      calls.push("initialize");
    },
    async expireCheckoutSessions() {
      calls.push("checkout-expiry");
      throw databaseFailure;
    },
    async listDeletionRetries() {
      calls.push("retry-scan");
      return [];
    },
    async purgeRetention() {
      calls.push("retention-purge");
      throw Object.assign(new Error("safe"), {
        code: "PRIVACY_DATABASE_UNAVAILABLE",
        databaseCode: "42601",
      });
    },
  };
  const service = privacyService({
    store,
    clerkClient: clerkStub({ calls }),
    whopClient: whopStub({ calls }),
    calls,
  });

  assert.equal(service.ready, false);
  await service.initialize();
  assert.equal(service.ready, true);
  assert.deepEqual(calls, ["initialize"]);

  await assert.rejects(service.maintenance(), (error) => {
    assert.equal(error.code, "PRIVACY_MAINTENANCE_INCOMPLETE");
    assert.deepEqual(error.diagnostics, [
      {
        stage: "checkout_expiry",
        code: "PRIVACY_DATABASE_UNAVAILABLE",
        databaseCode: "42501",
      },
      {
        stage: "retention_purge",
        code: "PRIVACY_DATABASE_UNAVAILABLE",
        databaseCode: "42601",
      },
    ]);
    return true;
  });
  assert.deepEqual(calls, [
    "initialize",
    "checkout-expiry",
    "retry-scan",
    "retention-purge",
  ]);
});

test("privacy identity requires Clerk's actual primary email", async () => {
  const calls = [];
  const service = privacyService({
    store: deletionStore({ calls, progress: deletionProgress() }),
    clerkClient: {
      users: {
        async getUser() {
          return {
            id: USER_ID,
            primaryEmailAddressId: "email_missing",
            emailAddresses: [
              { id: "email_other", emailAddress: "other@example.com" },
            ],
          };
        },
      },
    },
    whopClient: whopStub({ calls }),
    calls,
  });

  await assert.rejects(
    service.getProfile(USER_ID),
    (error) => error.status === 409 && error.code === "PRIVACY_EMAIL_REQUIRED",
  );
});

test("the first authenticated billing status seeds archive identity once", async () => {
  const calls = [];
  let seeded = false;
  const store = {
    ...deletionStore({ calls, progress: deletionProgress() }),
    async hasSubjectIdentity() {
      calls.push("has-subject");
      return seeded;
    },
    async isDeletionBlocked() {
      return "";
    },
    async archiveUserTransactions() {
      calls.push("archive");
      seeded = true;
    },
  };
  const service = privacyService({
    store,
    clerkClient: clerkStub({ calls }),
    whopClient: whopStub({ calls }),
    calls,
  });

  assert.equal(await service.seedSubjectIdentity(USER_ID), true);
  assert.equal(await service.seedSubjectIdentity(USER_ID), true);
  assert.equal(calls.filter((entry) => entry === "clerk-get").length, 1);
  assert.equal(calls.filter((entry) => entry === "archive").length, 1);
});

test("a new deletion is persistently blocked before Clerk identity loading", async () => {
  const calls = [];
  const store = deletionStore({
    calls,
    progress: deletionProgress(),
  });
  store.getDeletionForUser = async () => null;
  store.beginDeletion = async () => {
    calls.push("begin-deletion");
    return { requestId: REQUEST_ID, state: "blocked", existing: false };
  };
  const service = privacyService({
    store,
    clerkClient: clerkStub({ calls }),
    whopClient: whopStub({ calls }),
    calls,
  });

  const result = await service.deleteAccount(USER_ID);

  assert.deepEqual(result, { requestId: REQUEST_ID, state: "complete" });
  assert.ok(calls.indexOf("begin-deletion") < calls.indexOf("clerk-get"));
  assert.ok(calls.indexOf("clerk-get") < calls.indexOf("prepare-identity"));
  assert.ok(calls.indexOf("prepare-identity") < calls.indexOf("archive"));
});

test("a Clerk account missing before archival leaves deletion partial and preserves local evidence", async () => {
  const calls = [];
  const store = deletionStore({
    calls,
    progress: deletionProgress({ archiveComplete: false }),
  });
  const service = privacyService({
    store,
    clerkClient: clerkStub({ getUserStatus: 404, calls }),
    whopClient: whopStub({ calls }),
    calls,
  });

  const result = await service.deleteAccount(USER_ID);

  assert.deepEqual(result, { requestId: REQUEST_ID, state: "partial" });
  assert.equal(calls.includes("archive"), false);
  assert.equal(calls.includes("delete-operational"), false);
  assert.equal(calls.includes("clerk-delete"), false);
  assert.deepEqual(
    calls.find((entry) => Array.isArray(entry) && entry[0] === "partial"),
    ["partial", "PRIVACY_IDENTITY_MISSING_BEFORE_ARCHIVE"],
  );
});

test("a retry after Clerk deletion treats a 404 delete as idempotent completion", async () => {
  const calls = [];
  const store = deletionStore({
    calls,
    progress: deletionProgress({
      identityLoaded: true,
      archiveComplete: true,
      providerCancellationComplete: true,
      localDeletionComplete: true,
      clerkDeletionStarted: true,
    }),
  });
  const service = privacyService({
    store,
    clerkClient: clerkStub({ deleteUserStatus: 404, calls }),
    whopClient: whopStub({ calls }),
    calls,
  });

  const result = await service.deleteAccount(USER_ID);

  assert.deepEqual(result, { requestId: REQUEST_ID, state: "complete" });
  assert.equal(calls.includes("clerk-delete"), true);
  assert.equal(calls.includes("complete"), true);
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "partial"), false);
});

test("a Whop cancellation failure retains only retry IDs while Clerk deletion waits", async () => {
  const calls = [];
  const store = deletionStore({
    calls,
    progress: deletionProgress({
      identityLoaded: true,
      archiveComplete: true,
    }),
    memberships: [membership({ providerStatus: "active" })],
  });
  const service = privacyService({
    store,
    clerkClient: clerkStub({ calls }),
    whopClient: whopStub({
      calls,
      cancelError: Object.assign(new Error("provider unavailable"), {
        code: "WHOP_UNAVAILABLE",
      }),
    }),
    calls,
  });

  const result = await service.deleteAccount(USER_ID);

  assert.deepEqual(result, { requestId: REQUEST_ID, state: "partial" });
  assert.equal(calls.includes("whop-retrieve"), true);
  assert.equal(calls.includes("whop-cancel"), true);
  assert.equal(calls.includes("delete-operational"), true);
  assert.equal(calls.includes("clerk-delete"), false);
  assert.deepEqual(
    calls.find((entry) => Array.isArray(entry) && entry[0] === "partial"),
    ["partial", "WHOP_UNAVAILABLE"],
  );
});

test("past-due membership renewal is canceled before local and Clerk deletion", async () => {
  const calls = [];
  const store = deletionStore({
    calls,
    progress: deletionProgress({
      identityLoaded: true,
      archiveComplete: true,
    }),
    memberships: [membership({ providerStatus: "past_due" })],
  });
  const service = privacyService({
    store,
    clerkClient: clerkStub({ calls }),
    whopClient: whopStub({ calls }),
    calls,
  });

  const result = await service.deleteAccount(USER_ID);

  assert.deepEqual(result, { requestId: REQUEST_ID, state: "complete" });
  assert.ok(calls.indexOf("whop-cancel") < calls.indexOf("delete-operational"));
  assert.ok(calls.indexOf("delete-operational") < calls.indexOf("clerk-delete"));
  assert.ok(calls.indexOf("clerk-delete") < calls.indexOf("complete"));
  assert.equal(
    calls.some(
      (entry) =>
        Array.isArray(entry) &&
        entry[0] === "progress" &&
        entry[1]?.providerCancellationComplete === true,
    ),
    true,
  );
});

function privacyService({ store, clerkClient, whopClient, calls }) {
  return createPrivacyService({
    store,
    clerkSecretKey: "sk_test_privacy",
    clerkPublishableKey: "pk_test_privacy",
    clerkClient,
    whopClient,
    analysisJobs: {
      cancelForUser() {
        calls.push("cancel-jobs");
      },
    },
    deviceSessions: {
      async revokeUserSessions() {
        calls.push("revoke-device-sessions");
      },
    },
    userRateLimiter: {
      reset() {
        calls.push("reset-rate-limit");
      },
    },
    normalizeMembershipResource(resource) {
      return {
        id: String(resource.id),
        providerStatus: String(resource.status || "active"),
        accessState: resource.cancel_at_period_end
          ? "cancel_at_period_end"
          : "active",
        cancelAtPeriodEnd: resource.cancel_at_period_end === true,
        canceledAt: resource.canceled_at || null,
      };
    },
    now: () => new Date(NOW),
  });
}

function deletionStore({ calls, progress, memberships = [] }) {
  return {
    providerMode: "live",
    async getDeletionForUser() {
      return { requestId: REQUEST_ID, state: "partial" };
    },
    async withDeletionLock(_userId, callback) {
      return { acquired: true, value: await callback() };
    },
    async getDeletionProgress() {
      return { ...progress };
    },
    async updateDeletionProgress(_requestId, fields) {
      calls.push(["progress", fields]);
      return true;
    },
    async prepareDeletionIdentity() {
      calls.push("prepare-identity");
      return true;
    },
    async deleteDeviceRows() {
      calls.push("delete-device-rows");
    },
    async archiveUserTransactions() {
      calls.push("archive");
    },
    async prepareDeletionMembershipRetries() {
      calls.push("prepare-membership-retries");
      return memberships;
    },
    async deleteOperationalRows() {
      calls.push("delete-operational");
    },
    async recordProviderCancellation() {
      calls.push("record-provider-cancellation");
    },
    async markDeletionPartial(_requestId, code) {
      calls.push(["partial", code]);
    },
    async markDeletionComplete() {
      calls.push("complete");
    },
  };
}

function deletionProgress(overrides = {}) {
  return {
    requestId: REQUEST_ID,
    userId: USER_ID,
    state: "partial",
    attemptCount: 0,
    identityLoaded: false,
    archiveComplete: false,
    providerCancellationComplete: false,
    localDeletionComplete: false,
    clerkDeletionStarted: false,
    ...overrides,
  };
}

function membership(overrides = {}) {
  return {
    mode: "live",
    id: "mem_PrivacyMembership123",
    providerStatus: "active",
    cancelAtPeriodEnd: false,
    accessState: "active",
    ...overrides,
  };
}

function clerkStub({ getUserStatus = 200, deleteUserStatus = 200, calls }) {
  return {
    users: {
      async getUser() {
        calls.push("clerk-get");
        if (getUserStatus !== 200) {
          throw Object.assign(new Error("Clerk get failed"), {
            status: getUserStatus,
          });
        }
        return {
          id: USER_ID,
          primaryEmailAddressId: "email_primary",
          emailAddresses: [
            { id: "email_primary", emailAddress: "privacy@example.com" },
          ],
          firstName: "Privacy",
          lastName: "Tester",
          createdAt: NOW.getTime(),
          updatedAt: NOW.getTime(),
        };
      },
      async deleteUser() {
        calls.push("clerk-delete");
        if (deleteUserStatus !== 200) {
          throw Object.assign(new Error("Clerk delete failed"), {
            status: deleteUserStatus,
          });
        }
        return { id: USER_ID, deleted: true };
      },
    },
  };
}

function whopStub({ calls, cancelError = null }) {
  const id = "mem_PrivacyMembership123";
  return {
    async retrieveMembership() {
      calls.push("whop-retrieve");
      return { id, cancel_at_period_end: false };
    },
    async cancelMembershipAtPeriodEnd() {
      calls.push("whop-cancel");
      if (cancelError) throw cancelError;
      return { id, cancel_at_period_end: true };
    },
  };
}

function deletionConfirmation() {
  return {
    confirmImmediateLoss: true,
    confirmRenewalCancellation: true,
    confirmLegalRetention: true,
    confirmIrreversible: true,
    confirmText: "DELETE",
  };
}

function reauthenticationRequired(error) {
  return error?.status === 401 && error?.code === "AUTH_REVERIFICATION_REQUIRED";
}

function deletionConfirmationInvalid(error) {
  return error?.status === 400 && error?.code === "PRIVACY_DELETE_CONFIRMATION_INVALID";
}
