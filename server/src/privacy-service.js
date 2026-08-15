import { createClerkClient } from "@clerk/backend";
import { normalizeMembership } from "./billing-service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCELLABLE_PROVIDER_STATES = new Set([
  "active", "canceling", "past_due", "unresolved", "trialing", "drafted",
]);

export function createPrivacyService({
  store,
  clerkSecretKey,
  clerkPublishableKey,
  clerkTimeoutMs = 10000,
  whopClient,
  deviceSessions,
  analysisJobs,
  userRateLimiter,
  clerkClient,
  now = () => new Date(),
  purgeIntervalMs = DAY_MS,
  billingConfig,
  normalizeMembershipResource = (resource) =>
    normalizeMembership(billingConfig, resource),
}) {
  if (!store || !whopClient) {
    throw new Error("Privacy service requires privacy storage and Whop.");
  }
  const clerk = clerkClient || createClerkClient({
    secretKey: clerkSecretKey,
    publishableKey: clerkPublishableKey,
  });
  let nextPurgeAt = 0;
  let initialized = false;

  async function getProfile(userId) {
    let user;
    try {
      user = await withTimeout(clerk.users.getUser(userId), clerkTimeoutMs);
    } catch (error) {
      if (Number(error?.status) === 404) {
        throw privacyError(404, "PRIVACY_ACCOUNT_NOT_FOUND", "The account no longer exists.");
      }
      if (error?.code === "PRIVACY_PROVIDER_TIMEOUT") throw error;
      throw privacyError(503, "PRIVACY_IDENTITY_UNAVAILABLE", "Account information is temporarily unavailable.");
    }
    const primaryEmailId = String(user?.primaryEmailAddressId || "");
    const email = primaryEmailId
      ? user?.emailAddresses?.find(
          (entry) => String(entry?.id || "") === primaryEmailId,
        )?.emailAddress || ""
      : "";
    if (!email) {
      throw privacyError(409, "PRIVACY_EMAIL_REQUIRED", "A primary account email is required.");
    }
    return {
      id: String(user.id),
      primaryEmail: String(email),
      firstName: stringOrNull(user.firstName),
      lastName: stringOrNull(user.lastName),
      createdAt: dateStringOrNull(user.createdAt),
      updatedAt: dateStringOrNull(user.updatedAt),
    };
  }

  async function continueDeletionUnlocked({ requestId, userId }) {
    try {
      const progress = await store.getDeletionProgress(requestId, userId);
      if (!progress) {
        return { requestId, state: "complete" };
      }
      let localDeletionComplete = progress.localDeletionComplete;
      const deleteLiveRowsIfNeeded = async () => {
        if (localDeletionComplete) return;
        await store.deleteOperationalRows(userId);
        await store.updateDeletionProgress(
          requestId,
          { localDeletionComplete: true },
          now(),
        );
        localDeletionComplete = true;
      };
      analysisJobs?.cancelForUser?.(
        userId,
        "The account owner requested account deletion.",
      );
      userRateLimiter?.reset?.(userId);
      await deviceSessions?.revokeUserSessions?.(userId);
      await store.deleteDeviceRows(userId);

      if (!progress.archiveComplete) {
        let profile;
        try {
          profile = await getProfile(userId);
        } catch (error) {
          if (
            error?.code === "PRIVACY_ACCOUNT_NOT_FOUND" &&
            progress.clerkDeletionStarted &&
            progress.localDeletionComplete &&
            progress.providerCancellationComplete
          ) {
            await store.markDeletionComplete(requestId, now());
            return { requestId, state: "complete" };
          }
          if (error?.code === "PRIVACY_ACCOUNT_NOT_FOUND") {
            throw privacyError(
              503,
              "PRIVACY_IDENTITY_MISSING_BEFORE_ARCHIVE",
              "Deletion is blocked pending privacy review.",
            );
          }
          throw error;
        }
        await store.prepareDeletionIdentity({
          requestId,
          userId,
          email: profile.primaryEmail,
        });
        await store.archiveUserTransactions({
          userId,
          email: profile.primaryEmail,
          useStoredIdentity: true,
        });
        await store.updateDeletionProgress(requestId, { archiveComplete: true }, now());
      }

      if (!progress.providerCancellationComplete) {
        const memberships = await store.prepareDeletionMembershipRetries({
          requestId,
          userId,
        });
        try {
          for (const membership of memberships) {
            if (membership.mode !== store.providerMode) {
              throw privacyError(
                503,
                "PRIVACY_PROVIDER_MODE_UNAVAILABLE",
                "A subscription cancellation is pending provider review.",
              );
            }
            let current;
            try {
              current = normalizeMembershipResource(
                await whopClient.retrieveMembership(membership.id),
              );
            } catch (error) {
              if (Number(error?.providerStatus || error?.status) === 404) {
                continue;
              }
              throw error;
            }
            if (current.id !== membership.id) {
              throw privacyError(502, "PRIVACY_PROVIDER_MISMATCH", "Whop returned an unexpected membership.");
            }
            if (!CANCELLABLE_PROVIDER_STATES.has(current.providerStatus)) {
              continue;
            }
            let canceled = current;
            if (!current.cancelAtPeriodEnd) {
              canceled = normalizeMembershipResource(
                await whopClient.cancelMembershipAtPeriodEnd(membership.id),
              );
            }
            if (
              canceled.id !== membership.id ||
              canceled.cancelAtPeriodEnd !== true
            ) {
              throw privacyError(502, "PRIVACY_CANCELLATION_NOT_CONFIRMED", "Whop did not confirm renewal cancellation.");
            }
            await store.recordProviderCancellation({
              userId,
              membership: {
                ...canceled,
                mode: membership.mode,
              },
              at: now(),
            });
          }
        } catch (error) {
          // The queue now contains only the provider membership IDs needed for
          // retry. Remove the broader live account dataset even while Whop is
          // temporarily unavailable; the persistent block remains in force.
          await deleteLiveRowsIfNeeded();
          throw error;
        }
        await store.updateDeletionProgress(
          requestId,
          { providerCancellationComplete: true },
          now(),
        );
      }

      // The queue remains until Clerk deletion is confirmed. If the process
      // stops after this transaction, the raw user ID in the queue supports an
      // idempotent retry while the audit HMAC keeps access blocked.
      await deleteLiveRowsIfNeeded();
      await store.updateDeletionProgress(requestId, { clerkDeletionStarted: true }, now());
      try {
        await withTimeout(clerk.users.deleteUser(userId), clerkTimeoutMs);
      } catch (error) {
        if (Number(error?.status) !== 404) {
          if (error?.code === "PRIVACY_PROVIDER_TIMEOUT") throw error;
          throw privacyError(503, "PRIVACY_IDENTITY_DELETE_PENDING", "Account deletion is still being completed.");
        }
      }
      await store.markDeletionComplete(requestId, now());
      return { requestId, state: "complete" };
    } catch (error) {
      await store.markDeletionPartial(
        requestId,
        safePrivacyErrorCode(error),
        now(),
      ).catch(() => undefined);
      return { requestId, state: "partial" };
    }
  }

  async function continueDeletion(input) {
    const locked = await store.withDeletionLock(input.userId, () =>
      continueDeletionUnlocked(input));
    return locked.acquired
      ? locked.value
      : { requestId: input.requestId, state: "blocked" };
  }

  async function assertAllowed(userId) {
    const state = await store.isDeletionBlocked(userId);
    if (state) {
      throw privacyError(
        403,
        "ACCOUNT_DELETION_IN_PROGRESS",
        "This account is unavailable because deletion was requested.",
      );
    }
    return true;
  }

  return {
    get ready() {
      return initialized;
    },

    async initialize() {
      await store.initialize();
      nextPurgeAt = 0;
      initialized = true;
    },

    async close() {
      initialized = false;
      await store.close();
    },

    async assertUserAllowed(userId) {
      return assertAllowed(userId);
    },

    async ensureSubjectIdentity(userId) {
      const locked = await store.withDeletionLock(userId, async () => {
        await assertAllowed(userId);
        const profile = await getProfile(userId);
        await store.archiveUserTransactions({
          userId,
          email: profile.primaryEmail,
        });
        return profile;
      });
      if (!locked.acquired) {
        throw privacyError(
          409,
          "PRIVACY_OPERATION_IN_PROGRESS",
          "Another privacy operation is already in progress.",
        );
      }
      return locked.value;
    },

    async seedSubjectIdentity(userId) {
      if (await store.hasSubjectIdentity(userId)) {
        await assertAllowed(userId);
        return true;
      }
      const locked = await store.withDeletionLock(userId, async () => {
        await assertAllowed(userId);
        if (await store.hasSubjectIdentity(userId)) return true;
        const profile = await getProfile(userId);
        await store.archiveUserTransactions({
          userId,
          email: profile.primaryEmail,
        });
        return true;
      });
      if (!locked.acquired) {
        throw privacyError(
          409,
          "PRIVACY_OPERATION_IN_PROGRESS",
          "Another privacy operation is already in progress.",
        );
      }
      return locked.value;
    },

    async summary(userId) {
      const deletionState = await store.isDeletionBlocked(userId);
      return {
        categories: [
          {
            name: "Account and authentication",
            details: "Clerk account/profile and security session information used to sign you in.",
          },
          {
            name: "Extension sessions",
            details: "Device-session and pairing security records; credentials and secrets are never exported.",
          },
          {
            name: "Plan, quota, and billing",
            details: "Current plan, retained usage summaries, checkout state, membership state, and recent payment history.",
          },
          {
            name: "Question content",
            details: "Screenshots, prompts, instructions, questions, and answers are not retained as history.",
          },
          {
            name: "Browser-only settings",
            details: "Custom instructions are stored on this browser/device and are not held in the Zenaian server export.",
          },
        ],
        retention: [
          { category: "Analysis accounting", period: "30 days after settlement" },
          { category: "Usage summaries", period: "90 days after the usage period" },
          { category: "Live payment history", period: "Up to 12 months" },
          { category: "Contract and payment evidence", period: "5 years where required by Korean law" },
          { category: "Complaint/dispute evidence", period: "3 years where required by Korean law" },
          { category: "Privacy request audit", period: "1 year after completion" },
        ],
        transfers: [
          { provider: "Render", location: "United States (Virginia)", purpose: "API, database, security, and transient processing" },
          { provider: "Clerk", location: "United States and listed subprocessors", purpose: "Authentication and account security" },
          { provider: "xAI", location: "United States and listed subprocessors", purpose: "Transient generative-AI inference with mandatory ZDR" },
          { provider: "Whop", location: "United States and payment/tax partners", purpose: "Checkout, subscription, payment, tax, refund, and dispute processing" },
          { provider: "Google Workspace (planned)", location: "United States for covered data at rest", purpose: "Privacy correspondence" },
        ],
        deletion: {
          available: !deletionState,
          ...(deletionState ? { state: deletionState } : {}),
        },
      };
    },

    async exportData(userId) {
      const locked = await store.withDeletionLock(userId, async () => {
        await assertAllowed(userId);
        const requestId = await store.beginExport(userId, now());
        try {
          const profile = await getProfile(userId);
          await store.archiveUserTransactions({
            userId,
            email: profile.primaryEmail,
          });
          const serverData = await store.exportRows({
            userId,
            email: profile.primaryEmail,
          });
          await store.finishRequest(requestId, "complete", null, now());
          return {
            requestId,
            generatedAt: now().toISOString(),
            account: profile,
            serverData,
            localOnlyData: {
              customInstruction:
                "Stored on this browser/device; not held in the Zenaian server export.",
            },
            notRetained: [
              "Screenshots",
              "Questions",
              "Prompts and custom instructions submitted for inference",
              "Generated answers",
              "Passwords, MFA secrets, access tokens, and refresh tokens",
              "Card details and billing addresses",
            ],
          };
        } catch (error) {
          await store.finishRequest(
            requestId,
            "failed",
            safePrivacyErrorCode(error),
            now(),
          ).catch(() => undefined);
          throw error;
        }
      });
      if (!locked.acquired) {
        throw privacyError(
          409,
          "PRIVACY_OPERATION_IN_PROGRESS",
          "Another privacy operation is already in progress.",
        );
      }
      return locked.value;
    },

    async deleteAccount(userId) {
      const existing = await store.getDeletionForUser(userId);
      if (existing) {
        return continueDeletion({
          requestId: existing.requestId,
          userId,
        });
      }
      // Persist BLOCKED before any Clerk lookup, provider call, or destructive
      // work. The deletion worker prepares the HMAC subject identity through
      // a narrowly scoped database path that is valid only for this queue row.
      const request = await store.beginDeletion(userId, now());
      if (request.state === "complete") {
        return { requestId: request.requestId, state: "complete" };
      }
      return continueDeletion({ requestId: request.requestId, userId });
    },

    async maintenance() {
      const current = now();
      const diagnostics = [];
      let checkoutSessionsExpired = 0;
      try {
        checkoutSessionsExpired = await store.expireCheckoutSessions(
          current,
          500,
        );
      } catch (error) {
        diagnostics.push(maintenanceDiagnostic("checkout_expiry", error));
      }

      let retries = [];
      try {
        retries = await store.listDeletionRetries(10, current);
      } catch (error) {
        diagnostics.push(maintenanceDiagnostic("deletion_retry_scan", error));
      }
      let completed = 0;
      for (const retry of retries) {
        try {
          const result = await continueDeletion(retry);
          if (result.state === "complete") completed += 1;
        } catch (error) {
          diagnostics.push(maintenanceDiagnostic("deletion_retry", error));
        }
      }

      let purged = null;
      if (current.getTime() >= nextPurgeAt) {
        nextPurgeAt = current.getTime() + purgeIntervalMs;
        purged = {};
        try {
          for (let batch = 0; batch < 20; batch += 1) {
            const counts = await store.purgeRetention(current, 500);
            for (const [name, count] of Object.entries(counts)) {
              purged[name] = (purged[name] || 0) + Number(count || 0);
            }
            if (Math.max(0, ...Object.values(counts).map(Number)) < 500) break;
          }
        } catch (error) {
          diagnostics.push(maintenanceDiagnostic("retention_purge", error));
        }
      }
      if (diagnostics.length > 0) {
        throw Object.assign(
          new Error("Privacy maintenance was incomplete."),
          { code: "PRIVACY_MAINTENANCE_INCOMPLETE", diagnostics },
        );
      }
      return {
        retried: retries.length,
        completed,
        checkoutSessionsExpired,
        purged,
      };
    },

    getProfile,
    store,
  };
}

export function requireRecentAuthentication(auth, maxAgeMinutes = 10) {
  const age = auth?.factorVerificationAge;
  const firstFactorAge = Array.isArray(age) ? Number(age[0]) : NaN;
  if (
    !Number.isFinite(firstFactorAge) ||
    firstFactorAge < 0 ||
    firstFactorAge > maxAgeMinutes
  ) {
    throw privacyError(
      401,
      "AUTH_REVERIFICATION_REQUIRED",
      "Sign out and sign in again before using this privacy control.",
    );
  }
  return true;
}

export function validateDeletionConfirmation(body) {
  const expectedKeys = new Set([
    "confirmImmediateLoss",
    "confirmRenewalCancellation",
    "confirmLegalRetention",
    "confirmIrreversible",
    "confirmText",
  ]);
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== expectedKeys.size ||
    Object.keys(body).some((key) => !expectedKeys.has(key)) ||
    body.confirmImmediateLoss !== true ||
    body.confirmRenewalCancellation !== true ||
    body.confirmLegalRetention !== true ||
    body.confirmIrreversible !== true ||
    body.confirmText !== "DELETE"
  ) {
    throw privacyError(
      400,
      "PRIVACY_DELETE_CONFIRMATION_INVALID",
      "All deletion acknowledgements and the exact confirmation text are required.",
    );
  }
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(privacyError(503, "PRIVACY_PROVIDER_TIMEOUT", "A privacy provider timed out."));
    }, timeoutMs);
    timeout.unref?.();
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function stringOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

function dateStringOrNull(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safePrivacyErrorCode(error) {
  const code = String(error?.code || "");
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code
    : "PRIVACY_OPERATION_FAILED";
}

function maintenanceDiagnostic(stage, error) {
  const diagnostic = {
    stage,
    code: safePrivacyErrorCode(error),
  };
  const databaseCode = String(error?.databaseCode || "");
  if (/^[A-Z0-9]{5}$/.test(databaseCode)) {
    diagnostic.databaseCode = databaseCode;
  }
  if (
    Number.isInteger(error?.providerStatus) &&
    error.providerStatus >= 400 && error.providerStatus <= 599
  ) {
    diagnostic.providerStatus = error.providerStatus;
  }
  return diagnostic;
}

function privacyError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
