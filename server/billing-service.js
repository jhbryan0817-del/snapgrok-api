import { createHash, randomUUID } from "node:crypto";
import {
  acceptedWhopPlanIds,
  accessPeriodFor,
  BILLING_PLANS,
  chooseEffectiveSubscription,
  isBillingEnforcedForUser,
  planForWhopPlan,
  publicPlan,
  whopCatalogForPlan,
} from "./billing-policy.js";
import { verifyWhopWebhook } from "./whop.js";

const MEMBERSHIP_EVENTS = new Set([
  "membership.activated",
  "membership.deactivated",
  "membership.cancel_at_period_end_changed",
]);
const PAYMENT_EVENTS = new Set(["payment.succeeded", "payment.failed"]);
const REFUND_EVENTS = new Set(["refund.created", "refund.updated"]);
const DISPUTE_EVENTS = new Set(["dispute.created", "dispute.updated"]);
const PAID_PLAN_IDS = new Set(["plus", "ultra"]);
const RESTORED_DISPUTE_STATUSES = new Set(["won", "warning_closed"]);
const PAYMENT_FAILURE_SUBSTATUSES = new Set([
  "failed",
  "past_due",
  "canceled",
  "price_too_low",
  "uncollectible",
  "unresolved",
]);
const PAYMENT_REVOKED_SUBSTATUSES = new Set([
  "refunded",
  "auto_refunded",
  "partially_refunded",
  "dispute_warning",
  "dispute_needs_response",
  "dispute_warning_needs_response",
  "resolution_needs_response",
  "dispute_under_review",
  "dispute_warning_under_review",
  "resolution_under_review",
  "dispute_lost",
  "dispute_closed",
  "resolution_lost",
  "open_dispute",
  "open_resolution",
]);
const PAYMENT_RESTORED_SUBSTATUSES = new Set([
  "succeeded",
  "dispute_won",
  "dispute_warning_closed",
  "resolution_won",
]);
const MEMBERSHIP_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "completed",
  "canceled",
  "expired",
  "unresolved",
  "drafted",
  "canceling",
]);

export function createBillingService({
  config,
  store,
  whopClient,
  now = () => new Date(),
}) {
  if (!config || !store || !whopClient) {
    throw new Error("Billing service requires config, store, and Whop.");
  }
  let nextReconciliationAt = now().getTime() + config.billingReconciliationIntervalMs;

  return {
    async initialize() {
      await store.initialize();
      await this.maintenance();
    },

    async close() {
      await store.close();
    },

    async maintenance() {
      const current = now();
      const staleBefore = new Date(current.getTime() - config.billingReservationTtlMs);
      const webhookBefore = new Date(
        current.getTime() - config.billingWebhookRetentionDays * 86400000,
      );
      await store.releaseStaleReservations(staleBefore);
      await store.purgeWebhookBodies(webhookBefore);
      if (current.getTime() >= nextReconciliationAt) {
        nextReconciliationAt = current.getTime() + config.billingReconciliationIntervalMs;
        const result = await this.reconcile();
        if (result.failed > 0) {
          const error = publicError(
            503,
            "Automatic Whop reconciliation did not complete cleanly.",
            "BILLING_RECONCILIATION_INCOMPLETE",
          );
          error.diagnostics = result.failures;
          throw error;
        }
      }
    },

    async status(userId) {
      if (!isBillingEnforcedForUser(config, userId)) {
        return legacyStatus();
      }
      const access = await resolveCurrentAccess(config, store, userId, now());
      const usage = await store.getUsagePeriod(userId, access.period.key);
      const consumed = usage?.consumed || 0;
      const reserved = usage?.reserved || 0;
      return {
        billingEnabled: true,
        mode: config.billingMode,
        plan: publicPlan(access.planId),
        usage: {
          allowance: access.period.allowance,
          consumed,
          reserved,
          remaining: Math.max(0, access.period.allowance - consumed - reserved),
          resetsAt: access.period.endsAt.toISOString(),
        },
        subscription: access.subscription
          ? {
              provider: "whop",
              planId: access.subscription.planId,
              status: access.subscription.status,
              providerStatus: access.subscription.providerStatus,
              renewsAt: isoOrNull(access.subscription.renewsAt),
              endsAt: isoOrNull(access.subscription.endsAt),
              cancelAtPeriodEnd: Boolean(access.subscription.cancelAtPeriodEnd),
            }
          : null,
        subscriptions: publicSubscriptions(config, access.subscriptions, now()),
      };
    },

    async paymentHistory(userId) {
      if (!isBillingEnforcedForUser(config, userId)) {
        return { billingEnabled: false, payments: [] };
      }
      const payments = await store.listPaymentHistory(userId, 50);
      return {
        billingEnabled: true,
        payments: payments.map((payment) => ({
          reference: payment.reference,
          planId: payment.planId,
          status: payment.status,
          providerSubstatus: payment.providerSubstatus,
          paidAt: isoOrNull(payment.paidAt),
          updatedAt: isoOrNull(payment.updatedAt),
        })),
      };
    },

    async reserveAnalysis({ userId, operationId, defaultModel }) {
      if (!isBillingEnforcedForUser(config, userId)) {
        return {
          allowed: true,
          model: defaultModel,
          reservation: null,
          planId: "legacy",
        };
      }
      requireUuid(operationId, "operationId");
      const access = await resolveCurrentAccess(config, store, userId, now());
      const reservation = await store.reserveUsage({
        userId,
        operationId,
        planId: access.planId,
        model: access.period.model,
        period: access.period,
      });
      return {
        allowed: true,
        model: access.period.model,
        reservation,
        planId: access.planId,
      };
    },

    async consumeAnalysis({ userId, reservation }) {
      if (!reservation) return false;
      return store.consumeUsage(reservation.operationId, userId);
    },

    async releaseAnalysis({ userId, reservation }) {
      if (!reservation) return false;
      return store.releaseUsage(reservation.operationId, userId);
    },

    async createCheckout({ userId, planId }) {
      requireTesterAccess(config, userId);
      const catalog = whopCatalogForPlan(config, planId);
      if (!catalog) {
        throw publicError(400, "Unknown paid plan.", "BILLING_PLAN_INVALID");
      }
      const subscriptions = await store.listSubscriptions(userId);
      const currentSubscription = chooseEffectiveSubscription(
        config,
        subscriptions,
        now(),
      );
      if (currentSubscription) {
        throw publicError(
          409,
          "This account already has active paid access. Cancel renewal and wait for that paid period to expire before purchasing another plan.",
          "SUBSCRIPTION_ALREADY_ACTIVE",
        );
      }

      const intentId = randomUUID();
      const expiresAt = new Date(now().getTime() + config.billingCheckoutTtlMs);
      const intent = await store.createCheckoutIntent({
        id: intentId,
        userId,
        planCode: planId,
        companyId: config.whopCompanyId,
        productId: catalog.productId,
        providerPlanId: catalog.planId,
        expiresAt,
      });
      if (intent.existingUrl) return { url: intent.existingUrl };

      try {
        const checkout = await whopClient.createCheckout({
          planId: catalog.planId,
          redirectUrl: `${config.billingWebsiteOrigin}/account?billing=return`,
        });
        await store.markCheckoutCreated(intentId, checkout.id, checkout.url);
        return { url: checkout.url };
      } catch (error) {
        await store.markCheckoutFailed(intentId).catch(() => {});
        throw error;
      }
    },

    async cancelMembership({ userId, planId }) {
      requireTesterAccess(config, userId);
      requirePaidPlanId(planId);
      const subscriptions = await store.listSubscriptions(userId);
      const active = findEntitledPlanSubscription(
        config,
        subscriptions,
        planId,
        now(),
      );
      if (!active) {
        throw publicError(
          404,
          "No active paid membership is available to cancel for this plan.",
          "SUBSCRIPTION_NOT_FOUND",
        );
      }
      if (active.cancelAtPeriodEnd) {
        return {
          planId,
          cancelAtPeriodEnd: true,
          endsAt: isoOrNull(active.endsAt),
        };
      }

      const resource = await whopClient.cancelMembershipAtPeriodEnd(active.id);
      const membership = normalizeMembership(config, resource);
      if (membership.id !== active.id || membership.accessState !== "cancel_at_period_end") {
        throw publicError(
          502,
          "Whop did not confirm end-of-period cancellation.",
          "WHOP_CANCELLATION_NOT_CONFIRMED",
        );
      }
      const updated = await store.syncMappedMembership(
        membership,
        "api.cancel_at_period_end",
      );
      if (!updated) {
        throw publicError(
          409,
          "The membership changed while cancellation was being processed. Refresh and try again.",
          "SUBSCRIPTION_STATE_CHANGED",
        );
      }
      return {
        planId,
        cancelAtPeriodEnd: true,
        endsAt: isoOrNull(membership.renewalPeriodEnd),
      };
    },

    async reactivateMembership({ userId, planId }) {
      requireTesterAccess(config, userId);
      requirePaidPlanId(planId);
      const subscriptions = await store.listSubscriptions(userId);
      const canceled = findEntitledPlanSubscription(
        config,
        subscriptions,
        planId,
        now(),
      );
      if (!canceled || !canceled.cancelAtPeriodEnd) {
        throw publicError(
          404,
          "No active canceled renewal is available to reactivate for this plan.",
          "SUBSCRIPTION_NOT_REACTIVATABLE",
        );
      }
      const conflicting = chooseEffectiveSubscription(
        config,
        subscriptions.filter((subscription) => subscription.id !== canceled.id),
        now(),
      );
      if (conflicting) {
        throw publicError(
          409,
          "Another paid plan is already active on this account.",
          "SUBSCRIPTION_ALREADY_ACTIVE",
        );
      }

      const resource = await whopClient.uncancelMembership(canceled.id);
      const membership = normalizeMembership(config, resource);
      if (
        membership.id !== canceled.id ||
        membership.accessState !== "active" ||
        membership.cancelAtPeriodEnd
      ) {
        throw publicError(
          502,
          "Whop did not confirm renewal reactivation.",
          "WHOP_REACTIVATION_NOT_CONFIRMED",
        );
      }
      const updated = await store.syncMappedMembership(
        membership,
        "api.reactivate_renewal",
      );
      if (!updated) {
        throw publicError(
          409,
          "The membership changed while reactivation was being processed. Refresh and try again.",
          "SUBSCRIPTION_STATE_CHANGED",
        );
      }
      return {
        planId,
        cancelAtPeriodEnd: false,
        renewsAt: isoOrNull(membership.renewalPeriodEnd),
      };
    },

    async reconcile() {
      const membershipIds = await store.listMappedMembershipIds();
      let updated = 0;
      let recovered = 0;
      let paymentStatesUpdated = 0;
      let renewalsCanceled = 0;
      let failed = 0;
      const failures = [];

      // Webhook delivery is the fast path, while this durable queue closes the
      // gap where Whop accepted an immediate cancellation but the local
      // confirmation failed, or where a delivery was temporarily unavailable.
      try {
        const tombstones = store.listPendingCheckoutTombstones
          ? await store.listPendingCheckoutTombstones()
          : [];
        for (const tombstone of tombstones) {
          try {
            await enforceDeletedCheckoutMembership({
              config,
              store,
              whopClient,
              expected: tombstone,
              result: {
                duplicate: false,
                applied: false,
                quarantined: true,
                tombstoned: true,
                terminationRequired: true,
              },
            });
          } catch (error) {
            failed += 1;
            recordReconciliationFailure(
              failures,
              "deleted_checkout_termination",
              error,
            );
          }
        }
      } catch (error) {
        failed += 1;
        recordReconciliationFailure(
          failures,
          "deleted_checkout_termination_list",
          error,
        );
      }

      for (const membershipId of membershipIds) {
        try {
          const resource = await whopClient.retrieveMembership(membershipId);
          const membership = normalizeMembership(config, resource);
          if (await store.syncMappedMembership(membership)) updated += 1;
        } catch (error) {
          failed += 1;
          recordReconciliationFailure(failures, "membership", error);
        }
      }
      try {
        const cancellationIds =
          await store.listAdverseRenewalCancellationIds();
        for (const membershipId of cancellationIds) {
          try {
            if (await cancelRenewalForMembership({
              config,
              store,
              whopClient,
              membershipId,
            })) {
              renewalsCanceled += 1;
            }
          } catch (error) {
            failed += 1;
            recordReconciliationFailure(
              failures,
              "adverse_cancellation",
              error,
            );
          }
        }
      } catch (error) {
        failed += 1;
        recordReconciliationFailure(
          failures,
          "adverse_cancellation_list",
          error,
        );
      }
      try {
        const intents = await store.listRecoverableCheckoutIntents();
        const oldestIntentTime = intents.reduce(
          (oldest, intent) =>
            Math.min(oldest, new Date(intent.createdAt).getTime()),
          Number.POSITIVE_INFINITY,
        );
        const oneDayAgo = now().getTime() - 86400000;
        const updatedAfter = new Date(Math.min(oneDayAgo, oldestIntentTime));
        const payments = await whopClient.listPaymentsSince(updatedAfter, {
          planIds: acceptedWhopPlanIds(config),
        });
        const intentsByCheckout = new Map(
          intents.map((intent) => [intent.checkoutConfigurationId, intent]),
        );

        for (const resource of payments) {
          if (!isConfiguredCatalogResource(config, resource)) continue;
          try {
            const payment = normalizePayment(
              config,
              resource,
              "reconciliation.payment",
            );
            const action = reconciliationActionFor(payment.substatus);
            if (!action || !payment.membershipId) continue;
            const timestamp = payment.updatedAt || payment.createdAt;
            if (!timestamp) continue;
            const intent = intentsByCheckout.get(payment.checkoutConfigurationId);
            const mappedIntent =
              intent &&
              payment.companyId === intent.companyId &&
              payment.productId === intent.productId &&
              payment.planId === intent.planId
                ? intent
                : null;
            const eventName = `reconciliation.payment_${action}`;
            const common = {
              deliveryId: `reconcile_${payment.id}_${timestamp.getTime()}`,
              eventName,
              eventTimestamp: timestamp,
              payloadDigest: createHash("sha256")
                .update(
                  `${config.billingMode}:${payment.id}:${payment.substatus}:${timestamp.toISOString()}`,
                )
                .digest("hex"),
              sanitizedPayload: {
                companyId: payment.companyId,
                resourceId: payment.id,
                substatus: payment.substatus,
              },
            };

            if (action === "failed" || action === "revoked") {
              const result = await store.applyPaymentStateWebhook({
                ...common,
                payment,
                customUserId: mappedIntent?.userId || "",
                checkoutIntentId: mappedIntent?.id || "",
                accessState: action === "failed" ? "payment_failed" : "revoked",
                providerStatus: action === "failed" ? "past_due" : null,
              });
              if (action === "revoked") {
                await cancelRenewalAfterAdversePayment({
                  config,
                  store,
                  whopClient,
                  payment,
                });
              }
              if (result.applied) paymentStatesUpdated += 1;
              continue;
            }

            const membershipResource = await whopClient.retrieveMembership(
              payment.membershipId,
            );
            const membership = normalizeMembership(config, membershipResource);
            let result = await store.applyMembershipWebhook({
              ...common,
              membership,
              payment,
              customUserId: mappedIntent?.userId || "",
              checkoutIntentId: mappedIntent?.id || "",
              cycleStartedAt:
                payment.substatus === "succeeded"
                  ? membership.renewalPeriodStart
                  : null,
              allowAccessRestore: true,
            });
            result = await enforceDeletedCheckoutMembership({
              config,
              store,
              whopClient,
              expected: membership,
              result,
            });
            if (result.applied) {
              if (mappedIntent) recovered += 1;
              else paymentStatesUpdated += 1;
            }
          } catch (error) {
            failed += 1;
            recordReconciliationFailure(failures, "payment", error);
          }
        }
      } catch (error) {
        failed += 1;
        recordReconciliationFailure(failures, "payment_list", error);
      }
      return {
        checked: membershipIds.length,
        updated,
        recovered,
        paymentStatesUpdated,
        renewalsCanceled,
        failed,
        failures,
      };
    },

    async handleWebhook({
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
    }) {
      const verified = verifyWhopWebhook({
        rawBody,
        webhookId,
        webhookTimestamp,
        webhookSignature,
        secret: config.whopWebhookSecret,
        toleranceSeconds: config.whopWebhookToleranceSeconds,
        nowSeconds: Math.floor(now().getTime() / 1000),
      });

      let body;
      try {
        body = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw publicError(400, "Webhook JSON is invalid.", "WEBHOOK_INVALID_JSON");
      }
      const eventName = safeEventName(body?.type);
      const eventTimestamp = requiredDate(body?.timestamp);
      if (
        body?.id !== verified.id ||
        body?.api_version !== "v1" ||
        !eventName ||
        !eventTimestamp ||
        Math.abs(eventTimestamp.getTime() - verified.timestamp.getTime()) > 300000
      ) {
        throw webhookPayloadInvalid();
      }

      const payloadDigest = createHash("sha256").update(rawBody).digest("hex");
      const companyId = safeProviderId(body?.company_id, "biz");
      const resourceId = safeAnyProviderId(body?.data?.id);
      const common = {
        deliveryId: verified.id,
        eventName,
        eventTimestamp,
        payloadDigest,
        sanitizedPayload: {
          apiVersion: body.api_version,
          companyId: companyId || null,
          resourceId: resourceId || null,
        },
      };

      if (companyId !== config.whopCompanyId) {
        return quarantineProviderEvent(store, {
          common,
          companyId,
          eventName,
          resourceId,
          reason: "billing_configuration_mismatch",
        });
      }

      if (
        (MEMBERSHIP_EVENTS.has(eventName) || PAYMENT_EVENTS.has(eventName)) &&
        !isConfiguredCatalogResource(config, body.data)
      ) {
        return quarantineProviderEvent(store, {
          common,
          companyId,
          eventName,
          resourceId,
          reason: "billing_configuration_mismatch",
        });
      }

      if (MEMBERSHIP_EVENTS.has(eventName)) {
        const membership = normalizeMembership(config, body.data);
        const metadata = safeMetadata(body.data?.metadata);
        const result = await store.applyMembershipWebhook({
          ...common,
          membership,
          customUserId: safeClerkUserId(metadata.clerk_user_id),
          checkoutIntentId: safeUuid(metadata.checkout_intent_id),
        });
        return {
          accepted: true,
          ...(await enforceDeletedCheckoutMembership({
            config,
            store,
            whopClient,
            expected: membership,
            result,
          })),
        };
      }

      if (PAYMENT_EVENTS.has(eventName)) {
        const payment = normalizePayment(config, body.data, eventName);
        const metadata = safeMetadata(body.data?.metadata);
        if (eventName === "payment.failed") {
          return {
            accepted: true,
            ...(await store.applyPaymentStateWebhook({
              ...common,
              payment,
              customUserId: safeClerkUserId(metadata.clerk_user_id),
              checkoutIntentId: safeUuid(metadata.checkout_intent_id),
              accessState: "payment_failed",
              providerStatus: "past_due",
            })),
          };
        }

        if (!payment.membershipId) throw webhookPayloadInvalid();
        const resource = await whopClient.retrieveMembership(payment.membershipId);
        const membership = normalizeMembership(config, resource);
        const membershipMetadata = safeMetadata(resource?.metadata);
        const result = await store.applyMembershipWebhook({
          ...common,
          membership,
          payment,
          customUserId: safeClerkUserId(
            metadata.clerk_user_id || membershipMetadata.clerk_user_id,
          ),
          checkoutIntentId: safeUuid(
            metadata.checkout_intent_id || membershipMetadata.checkout_intent_id,
          ),
          cycleStartedAt: membership.renewalPeriodStart,
        });
        return {
          accepted: true,
          ...(await enforceDeletedCheckoutMembership({
            config,
            store,
            whopClient,
            expected: membership,
            result,
          })),
        };
      }

      if (REFUND_EVENTS.has(eventName) || DISPUTE_EVENTS.has(eventName)) {
        const paymentId = safeProviderId(body.data?.payment?.id, "pay");
        if (!paymentId) throw webhookPayloadInvalid();
        const paymentResource = await whopClient.retrievePayment(paymentId);
        if (!isConfiguredCatalogResource(config, paymentResource)) {
          return quarantineProviderEvent(store, {
            common,
            companyId,
            eventName,
            resourceId,
            reason: "billing_configuration_mismatch",
          });
        }
        const payment = normalizePayment(config, paymentResource, eventName);
        if (!payment.membershipId) throw webhookPayloadInvalid();

        const shouldRestore =
          REFUND_EVENTS.has(eventName)
            ? refundRestoresAccess(body.data, payment)
            : disputeRestoresAccess(body.data, payment);
        if (!shouldRestore) {
          const result = await store.applyPaymentStateWebhook({
            ...common,
            sanitizedPayload: {
              ...common.sanitizedPayload,
              resourceId: payment.id,
            },
            payment,
            customUserId: "",
            checkoutIntentId: "",
            accessState: "revoked",
          });
          // Apply the local hold first so access is revoked even if Whop is
          // briefly unavailable. A non-2xx response then causes Whop to retry,
          // and duplicate deliveries still retry this idempotent cancellation.
          await cancelRenewalAfterAdversePayment({
            config,
            store,
            whopClient,
            payment,
          });
          return {
            accepted: true,
            ...result,
          };
        }

        const resource = await whopClient.retrieveMembership(payment.membershipId);
        const membership = normalizeMembership(config, resource);
        const result = await store.applyMembershipWebhook({
          ...common,
          sanitizedPayload: {
            ...common.sanitizedPayload,
            resourceId: payment.id,
          },
          membership,
          payment,
          customUserId: "",
          checkoutIntentId: "",
          allowAccessRestore: true,
        });
        return {
          accepted: true,
          ...(await enforceDeletedCheckoutMembership({
            config,
            store,
            whopClient,
            expected: membership,
            result,
          })),
        };
      }

      const recorded = await store.recordProviderEvent({
        ...common,
        companyId,
        resourceType: resourceTypeFor(eventName),
        resourceId,
        state: "ignored",
        reason: "event_not_required",
      });
      return { accepted: true, duplicate: recorded.duplicate, applied: false };
    },
  };
}

export function createBypassBillingService(config) {
  return {
    async initialize() {},
    async close() {},
    async maintenance() {},
    async status() { return legacyStatus(); },
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
    async createCheckout() { throw publicError(404, "Not found.", "NOT_FOUND"); },
    async cancelMembership() { throw publicError(404, "Not found.", "NOT_FOUND"); },
    async reactivateMembership() { throw publicError(404, "Not found.", "NOT_FOUND"); },
    async reconcile() {
      return {
        checked: 0,
        updated: 0,
        recovered: 0,
        paymentStatesUpdated: 0,
        renewalsCanceled: 0,
        failed: 0,
        failures: [],
      };
    },
    async handleWebhook() { throw publicError(404, "Not found.", "NOT_FOUND"); },
    config,
  };
}

export function normalizeMembership(config, resource) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    throw webhookPayloadInvalid();
  }
  const id = safeProviderId(resource.id, "mem");
  const companyId = safeProviderId(resource.company?.id, "biz");
  const productId = safeProviderId(resource.product?.id, "prod");
  const planId = safeProviderId(resource.plan?.id, "plan");
  const providerStatus = String(resource.status || "");
  const createdAt = requiredDate(resource.created_at);
  const updatedAt = requiredDate(resource.updated_at);
  const renewalPeriodStart = optionalDate(resource.renewal_period_start);
  const renewalPeriodEnd = optionalDate(resource.renewal_period_end);
  const cancelAtPeriodEnd = resource.cancel_at_period_end === true;
  const planCode = planForWhopPlan(config, planId, productId);
  const memberId = optionalProviderId(resource.member?.id, "mber");
  const userId = optionalProviderId(resource.user?.id, "user");
  const checkoutConfigurationId = optionalProviderId(
    resource.checkout_configuration_id,
    "ch",
  );
  const canceledAt = optionalDate(resource.canceled_at);

  if (
    !id ||
    companyId !== config.whopCompanyId ||
    !planCode ||
    !MEMBERSHIP_STATUSES.has(providerStatus) ||
    !createdAt ||
    !updatedAt ||
    !checkoutConfigurationId
  ) {
    throw webhookPayloadInvalid();
  }
  const accessState = accessStateFor({
    providerStatus,
    cancelAtPeriodEnd,
  });
  if (
    ["active", "cancel_at_period_end"].includes(accessState) &&
    (!renewalPeriodStart || !renewalPeriodEnd || renewalPeriodEnd <= renewalPeriodStart)
  ) {
    throw webhookPayloadInvalid();
  }
  return {
    id,
    companyId,
    productId,
    planId,
    planCode,
    providerStatus,
    accessState,
    memberId,
    userId,
    renewalPeriodStart,
    renewalPeriodEnd,
    cancelAtPeriodEnd,
    canceledAt,
    checkoutConfigurationId,
    createdAt,
    updatedAt,
  };
}

function normalizePayment(config, resource, eventName) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    throw webhookPayloadInvalid();
  }
  const id = safeProviderId(resource.id, "pay");
  const companyId = safeProviderId(resource.company?.id, "biz");
  const productId = safeProviderId(resource.product?.id, "prod");
  const planId = safeProviderId(resource.plan?.id, "plan");
  const membershipId = optionalProviderId(resource.membership?.id, "mem");
  const checkoutConfigurationId = optionalProviderId(
    resource.checkout_configuration_id,
    "ch",
  );
  const planCode = planForWhopPlan(config, planId, productId);
  const substatus = String(resource.substatus || "").trim().toLowerCase();
  const displayStatus = paymentDisplayStatus(substatus);
  const settlementAmount = optionalNonnegativeNumber(
    resource.settlement_amount ?? resource.final_amount,
  );
  const taxAmount = optionalNonnegativeNumber(resource.tax_amount);
  const currency = optionalToken(
    resource.settlement_currency ?? resource.currency,
    /^[a-z]{3}$/i,
  );
  const taxBehavior = optionalToken(
    resource.tax_behavior,
    /^(?:exclusive|inclusive|unspecified|unable_to_collect)$/,
  );
  const billingReason = optionalToken(
    resource.billing_reason,
    /^(?:subscription_create|subscription_cycle|subscription_update|one_time|manual|subscription)$/,
  );
  if (
    !id ||
    companyId !== config.whopCompanyId ||
    !planCode ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(substatus) ||
    settlementAmount === undefined ||
    taxAmount === undefined ||
    currency === "" ||
    taxBehavior === "" ||
    billingReason === "" ||
    (!membershipId && !checkoutConfigurationId) ||
    (eventName === "payment.succeeded" && !membershipId)
  ) {
    throw webhookPayloadInvalid();
  }
  return {
    id,
    companyId,
    productId,
    planId,
    planCode,
    membershipId,
    checkoutConfigurationId,
    status: String(resource.status || ""),
    substatus,
    displayStatus,
    settlementAmount,
    currency,
    taxAmount,
    taxBehavior,
    billingReason,
    paidAt: optionalDate(resource.paid_at),
    createdAt: optionalDate(resource.created_at),
    updatedAt: optionalDate(resource.updated_at),
    refundedAt:
      displayStatus === "refunded"
        ? optionalDate(resource.refunded_at) || optionalDate(resource.updated_at)
        : null,
    disputedAt:
      displayStatus === "disputed"
        ? optionalDate(resource.disputed_at) || optionalDate(resource.updated_at)
        : null,
  };
}

async function resolveCurrentAccess(config, store, userId, currentTime) {
  const subscriptions = await store.listSubscriptions(userId);
  const subscription = chooseEffectiveSubscription(config, subscriptions, currentTime);
  const planId = subscription?.planId || "free";
  try {
    const period = accessPeriodFor({ planId, subscription, now: currentTime });
    return {
      planId,
      subscription,
      subscriptions,
      period: namespacePeriod(config.billingMode, period),
    };
  } catch {
    const period = accessPeriodFor({
      planId: "free",
      subscription: null,
      now: currentTime,
    });
    return {
      planId: "free",
      subscription: null,
      subscriptions,
      period: namespacePeriod(config.billingMode, period),
    };
  }
}

function findEntitledPlanSubscription(
  config,
  subscriptions,
  planId,
  currentTime,
) {
  return chooseEffectiveSubscription(
    config,
    subscriptions.filter(
      (subscription) =>
        planForWhopPlan(
          config,
          subscription.providerPlanId,
          subscription.providerProductId,
        ) === planId,
    ),
    currentTime,
  );
}

function publicSubscriptions(config, subscriptions, currentTime) {
  return ["plus", "ultra"].flatMap((planId) => {
    const candidates = subscriptions
      .filter(
        (subscription) =>
          planForWhopPlan(
            config,
            subscription.providerPlanId,
            subscription.providerProductId,
          ) === planId,
      )
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
    const subscription =
      findEntitledPlanSubscription(config, candidates, planId, currentTime) ||
      candidates.find((candidate) =>
        ["payment_failed", "revoked"].includes(candidate.status),
      );
    if (!subscription) return [];
    return [{
      provider: "whop",
      planId,
      status: subscription.status,
      providerStatus: subscription.providerStatus,
      renewsAt: isoOrNull(subscription.renewsAt),
      endsAt: isoOrNull(subscription.endsAt),
      cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    }];
  });
}

function namespacePeriod(mode, period) {
  return { ...period, key: `${mode}:${period.key}` };
}

function refundRestoresAccess(resource, payment) {
  return (
    ["failed", "canceled"].includes(String(resource?.status || "")) &&
    payment.substatus === "succeeded"
  );
}

function disputeRestoresAccess(resource) {
  return RESTORED_DISPUTE_STATUSES.has(String(resource?.status || ""));
}

function reconciliationActionFor(substatus) {
  if (PAYMENT_FAILURE_SUBSTATUSES.has(substatus)) return "failed";
  if (PAYMENT_REVOKED_SUBSTATUSES.has(substatus)) return "revoked";
  if (PAYMENT_RESTORED_SUBSTATUSES.has(substatus)) return "restored";
  return "";
}

async function enforceDeletedCheckoutMembership({
  config,
  store,
  whopClient,
  expected,
  result,
}) {
  if (!result?.tombstoned || !result.terminationRequired) return result;
  const membershipId = expected.id || expected.membershipId;
  const resource = await whopClient.retrieveMembership(membershipId);
  let membership = normalizeMembership(config, resource);
  assertDeletedCheckoutMapping(expected, membership);

  if (membership.accessState !== "inactive") {
    const canceledResource = await whopClient.cancelMembershipImmediately(
      membership.id,
    );
    membership = normalizeMembership(config, canceledResource);
    assertDeletedCheckoutMapping(expected, membership);
    if (membership.accessState !== "inactive") {
      throw publicError(
        502,
        "Whop did not confirm immediate cancellation of a deleted-account checkout.",
        "WHOP_IMMEDIATE_CANCELLATION_NOT_CONFIRMED",
      );
    }
  }

  if (result.terminationConfirmationRequired !== false) {
    await store.confirmCheckoutTombstoneTermination(membership);
  }
  return {
    ...result,
    terminationRequired: false,
    terminationConfirmed: true,
  };
}

function assertDeletedCheckoutMapping(expected, membership) {
  if (
    membership.id !== (expected.id || expected.membershipId) ||
    membership.checkoutConfigurationId !== expected.checkoutConfigurationId ||
    membership.companyId !== expected.companyId ||
    membership.productId !== expected.productId ||
    membership.planId !== expected.planId ||
    membership.planCode !== expected.planCode
  ) {
    throw publicError(
      502,
      "Whop returned a membership for the wrong deleted checkout.",
      "WHOP_TOMBSTONE_MAPPING_MISMATCH",
    );
  }
}

async function cancelRenewalAfterAdversePayment({
  config,
  store,
  whopClient,
  payment,
}) {
  if (!payment.membershipId) throw webhookPayloadInvalid();
  return cancelRenewalForMembership({
    config,
    store,
    whopClient,
    membershipId: payment.membershipId,
  });
}

async function cancelRenewalForMembership({
  config,
  store,
  whopClient,
  membershipId,
}) {
  const resource = await whopClient.retrieveMembership(membershipId);
  const membership = normalizeMembership(config, resource);
  if (membership.id !== membershipId) throw webhookPayloadInvalid();

  if (
    membership.cancelAtPeriodEnd ||
    membership.accessState !== "active"
  ) {
    await store.syncMappedMembership(
      membership,
      "automatic.adverse_cancel_at_period_end",
    );
    return false;
  }

  const canceledResource = await whopClient.cancelMembershipAtPeriodEnd(
    membership.id,
  );
  const canceled = normalizeMembership(config, canceledResource);
  if (
    canceled.id !== membership.id ||
    canceled.accessState !== "cancel_at_period_end" ||
    !canceled.cancelAtPeriodEnd
  ) {
    throw publicError(
      502,
      "Whop did not confirm automatic renewal cancellation.",
      "WHOP_CANCELLATION_NOT_CONFIRMED",
    );
  }
  await store.syncMappedMembership(
    canceled,
    "automatic.adverse_cancel_at_period_end",
  );
  return true;
}

function paymentDisplayStatus(substatus) {
  if (["refunded", "auto_refunded", "partially_refunded"].includes(substatus)) {
    return "refunded";
  }
  if (
    substatus.startsWith("dispute_") ||
    substatus.startsWith("resolution_") ||
    substatus === "open_dispute" ||
    substatus === "open_resolution"
  ) {
    return PAYMENT_RESTORED_SUBSTATUSES.has(substatus) ? "paid" : "disputed";
  }
  return substatus === "succeeded" ? "paid" : null;
}

function isConfiguredCatalogResource(config, resource) {
  return Boolean(
    resource &&
    typeof resource === "object" &&
    !Array.isArray(resource) &&
    safeProviderId(resource.company?.id, "biz") === config.whopCompanyId &&
    planForWhopPlan(
      config,
      safeProviderId(resource.plan?.id, "plan"),
      safeProviderId(resource.product?.id, "prod"),
    ),
  );
}

async function quarantineProviderEvent(
  store,
  { common, companyId, eventName, resourceId, reason },
) {
  const recorded = await store.recordProviderEvent({
    ...common,
    companyId,
    resourceType: resourceTypeFor(eventName),
    resourceId,
    state: "quarantined",
    reason,
  });
  return {
    accepted: true,
    duplicate: recorded.duplicate,
    applied: false,
    quarantined: true,
  };
}

function recordReconciliationFailure(failures, stage, error) {
  if (failures.length >= 10) return;
  const code = String(error?.code || "");
  failures.push({
    stage,
    code: /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "INTERNAL_ERROR",
    databaseCode:
      /^[A-Z0-9]{5}$/.test(String(error?.databaseCode || ""))
        ? String(error.databaseCode)
        : undefined,
    providerStatus:
      Number.isInteger(error?.providerStatus) &&
      error.providerStatus >= 400 &&
      error.providerStatus <= 599
        ? error.providerStatus
        : undefined,
    providerType:
      /^[a-z][a-z0-9_]{0,63}$/.test(String(error?.providerType || ""))
        ? error.providerType
        : undefined,
  });
}

function requirePaidPlanId(planId) {
  if (!PAID_PLAN_IDS.has(planId)) {
    throw publicError(400, "Unknown paid plan.", "BILLING_PLAN_INVALID");
  }
}

function accessStateFor({ providerStatus, cancelAtPeriodEnd }) {
  if (providerStatus === "active") {
    return cancelAtPeriodEnd ? "cancel_at_period_end" : "active";
  }
  if (providerStatus === "canceling") return "cancel_at_period_end";
  if (providerStatus === "past_due" || providerStatus === "unresolved") {
    return "payment_failed";
  }
  // Trials are intentionally not entitled. Zenaian has no free trial.
  return "inactive";
}

function legacyStatus() {
  return {
    billingEnabled: false,
    mode: "legacy",
    plan: null,
    usage: null,
    subscription: null,
    subscriptions: [],
  };
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function resourceTypeFor(eventName) {
  if (eventName.startsWith("membership.")) return "membership";
  if (eventName.startsWith("payment.")) return "payment";
  if (eventName.startsWith("refund.")) return "refund";
  if (eventName.startsWith("dispute.")) return "dispute";
  return "other";
}

function safeProviderId(value, prefix) {
  const id = String(value || "");
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{6,120}$`).test(id) ? id : "";
}

function optionalProviderId(value, prefix) {
  if (value == null || value === "") return null;
  return safeProviderId(value, prefix) || "";
}

function safeAnyProviderId(value) {
  const id = String(value || "");
  return /^[a-z]{2,12}_[A-Za-z0-9_-]{6,120}$/.test(id) ? id : "";
}

function safeClerkUserId(value) {
  const id = String(value || "");
  return /^user_[A-Za-z0-9]{10,80}$/.test(id) ? id : "";
}

function safeUuid(value) {
  const id = String(value || "").toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    ? id
    : "";
}

function requireUuid(value, name) {
  if (!safeUuid(value)) {
    throw publicError(400, `${name} must be a UUID.`, "INVALID_OPERATION_ID");
  }
}

function safeEventName(value) {
  const name = String(value || "");
  return /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){1,3}$/.test(name) ? name : "";
}

function requiredDate(value) {
  return optionalDate(value);
}

function optionalDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function optionalNonnegativeNumber(value) {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= 1_000_000_000
    ? value
    : undefined;
}

function optionalToken(value, pattern) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return pattern.test(normalized) ? normalized : "";
}

function isoOrNull(value) {
  return optionalDate(value)?.toISOString() || null;
}

function requireTesterAccess(config, userId) {
  if (!isBillingEnforcedForUser(config, userId)) {
    throw publicError(404, "Not found.", "NOT_FOUND");
  }
}

function webhookPayloadInvalid() {
  return publicError(400, "Webhook payload is invalid.", "WEBHOOK_PAYLOAD_INVALID");
}

function publicError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

export const billingPlanPolicy = BILLING_PLANS;
