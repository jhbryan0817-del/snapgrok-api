import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  accessPeriodFor,
  BILLING_PLANS,
  chooseEffectiveSubscription,
  isBillingEnforcedForUser,
  planForVariant,
  publicPlan,
  variantForPlan,
} from "./billing-policy.js";

const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
]);
const SUBSCRIPTION_PAYMENT_SUCCESS_EVENT = "subscription_payment_success";

const SUBSCRIPTION_STATUSES = new Set([
  "on_trial",
  "active",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
]);

export function createBillingService({
  config,
  store,
  lemonClient,
  now = () => new Date(),
}) {
  if (!config || !store || !lemonClient) {
    throw new Error("Billing service requires config, store, and Lemon Squeezy.");
  }

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
      const staleBefore = new Date(
        current.getTime() - config.billingReservationTtlMs,
      );
      const webhookBefore = new Date(
        current.getTime() -
          config.billingWebhookRetentionDays * 24 * 60 * 60 * 1000,
      );
      await store.releaseStaleReservations(staleBefore);
      await store.purgeWebhookBodies(webhookBefore);
    },

    async status(userId) {
      if (!isBillingEnforcedForUser(config, userId)) {
        return {
          billingEnabled: false,
          mode: "legacy",
          plan: null,
          usage: null,
          subscription: null,
        };
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
          remaining: Math.max(
            0,
            access.period.allowance - consumed - reserved,
          ),
          resetsAt: access.period.endsAt.toISOString(),
        },
        subscription: access.subscription
          ? {
              status: access.subscription.status,
              renewsAt: isoOrNull(access.subscription.renewsAt),
              endsAt: isoOrNull(access.subscription.endsAt),
            }
          : null,
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

    async createCheckout({ userId, planId, email, name }) {
      requireTesterAccess(config, userId);
      const variantId = variantForPlan(config, planId);
      if (!variantId) {
        throw publicError(400, "Unknown paid plan.", "BILLING_PLAN_INVALID");
      }

      const intentId = randomUUID();
      const expiresAt = new Date(now().getTime() + 30 * 60 * 1000);
      const intent = await store.createCheckoutIntent({
        id: intentId,
        userId,
        planId,
        variantId,
        expiresAt,
      });
      if (intent.existingUrl) {
        return { url: intent.existingUrl };
      }

      try {
        const checkout = await lemonClient.createCheckout({
          variantId,
          email,
          name,
          custom: {
            clerk_user_id: userId,
            checkout_intent_id: intentId,
          },
          redirectUrl: `${config.billingWebsiteOrigin}/account?billing=return`,
        });
        await store.markCheckoutCreated(intentId, checkout.id, checkout.url);
        return { url: checkout.url };
      } catch (error) {
        await store.markCheckoutFailed(intentId).catch(() => {});
        throw error;
      }
    },

    async customerPortal({ userId }) {
      requireTesterAccess(config, userId);
      const subscriptions = await store.listSubscriptions(userId);
      const active = chooseEffectiveSubscription(config, subscriptions, now());
      if (!active) {
        throw publicError(
          404,
          "No paid subscription is available to manage.",
          "SUBSCRIPTION_NOT_FOUND",
        );
      }
      const url = await lemonClient.customerPortalUrl(active.id);
      return { url };
    },

    async reconcile() {
      const subscriptionIds = await store.listMappedSubscriptionIds();
      let updated = 0;
      let failed = 0;
      for (const subscriptionId of subscriptionIds) {
        try {
          const resource = await lemonClient.retrieveSubscription(
            subscriptionId,
          );
          const subscription = normalizeSubscription(resource);
          if (
            subscription.storeId !== config.lemonStoreId ||
            subscription.productId !== config.lemonProductId ||
            !planForVariant(config, subscription.variantId) ||
            subscription.testMode !== (config.billingMode === "test")
          ) {
            failed += 1;
            continue;
          }
          if (await store.syncMappedSubscription(subscription)) updated += 1;
        } catch {
          failed += 1;
        }
      }
      return { checked: subscriptionIds.length, updated, failed };
    },

    async handleWebhook({ rawBody, signature, headerEventName }) {
      verifyWebhookSignature(
        rawBody,
        signature,
        config.lemonWebhookSecret,
      );

      let body;
      try {
        body = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw publicError(400, "Webhook JSON is invalid.", "WEBHOOK_INVALID_JSON");
      }
      const eventName = safeEventName(body?.meta?.event_name);
      if (!eventName || eventName !== safeEventName(headerEventName)) {
        throw publicError(
          400,
          "Webhook event name is invalid.",
          "WEBHOOK_EVENT_INVALID",
        );
      }

      const deliveryHash = createHash("sha256")
        .update(eventName)
        .update("\n")
        .update(rawBody)
        .digest("hex");
      const resourceType = safeResourceType(body?.data?.type);
      const resourceId = safePositiveId(body?.data?.id);
      const resourceUpdatedAt = optionalDate(
        body?.data?.attributes?.updated_at,
      );

      if (
        eventName === SUBSCRIPTION_PAYMENT_SUCCESS_EVENT &&
        resourceType === "subscription-invoices"
      ) {
        const invoice = normalizeSubscriptionInvoice(body?.data);
        if (
          invoice.storeId !== config.lemonStoreId ||
          invoice.testMode !== (config.billingMode === "test")
        ) {
          const recorded = await store.recordWebhook({
            deliveryHash,
            eventName,
            body,
            resourceType,
            resourceId,
            resourceUpdatedAt,
            state: "quarantined",
            reason: "billing_configuration_mismatch",
          });
          return {
            accepted: true,
            duplicate: recorded.duplicate,
            applied: false,
            quarantined: true,
          };
        }

        const currentResource = await lemonClient.retrieveSubscription(
          invoice.subscriptionId,
        );
        const normalizedSubscription = normalizeSubscription(currentResource);
        if (
          normalizedSubscription.id !== invoice.subscriptionId ||
          normalizedSubscription.storeId !== config.lemonStoreId ||
          normalizedSubscription.productId !== config.lemonProductId ||
          !planForVariant(config, normalizedSubscription.variantId) ||
          normalizedSubscription.testMode !== (config.billingMode === "test")
        ) {
          throw webhookPayloadInvalid();
        }
        return {
          accepted: true,
          ...(await store.applySubscriptionPaymentWebhook({
            deliveryHash,
            eventName,
            body,
            invoice,
            normalizedSubscription,
            cycleStartedAt:
              invoice.billingReason === "renewal" && invoice.status === "paid"
                ? invoice.createdAt
                : null,
          })),
        };
      }

      if (!SUBSCRIPTION_EVENTS.has(eventName) || resourceType !== "subscriptions") {
        const recorded = await store.recordWebhook({
          deliveryHash,
          eventName,
          body,
          resourceType,
          resourceId,
          resourceUpdatedAt,
          state: "ignored",
          reason: "event_not_required",
        });
        return { accepted: true, duplicate: recorded.duplicate, applied: false };
      }

      const normalized = normalizeSubscription(body?.data);
      const expectedPlan = planForVariant(config, normalized.variantId);
      const matchesConfiguration =
        normalized.storeId === config.lemonStoreId &&
        normalized.productId === config.lemonProductId &&
        Boolean(expectedPlan) &&
        normalized.testMode === (config.billingMode === "test");
      if (!matchesConfiguration) {
        const recorded = await store.recordWebhook({
          deliveryHash,
          eventName,
          body,
          resourceType,
          resourceId,
          resourceUpdatedAt,
          state: "quarantined",
          reason: "billing_configuration_mismatch",
        });
        return {
          accepted: true,
          duplicate: recorded.duplicate,
          applied: false,
          quarantined: true,
        };
      }

      const customUserId = safeClerkUserId(
        body?.meta?.custom_data?.clerk_user_id,
      );
      const checkoutIntentId = safeUuid(
        body?.meta?.custom_data?.checkout_intent_id,
      );
      const result = await store.applySubscriptionWebhook({
        deliveryHash,
        eventName,
        body,
        normalizedSubscription: normalized,
        customUserId,
        checkoutIntentId,
      });
      return { accepted: true, ...result };
    },
  };
}

export function createBypassBillingService(config) {
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
      throw publicError(404, "Not found.", "NOT_FOUND");
    },
    async customerPortal() {
      throw publicError(404, "Not found.", "NOT_FOUND");
    },
    async reconcile() {
      return { checked: 0, updated: 0, failed: 0 };
    },
    async handleWebhook() {
      throw publicError(404, "Not found.", "NOT_FOUND");
    },
    config,
  };
}

async function resolveCurrentAccess(config, store, userId, currentTime) {
  const subscriptions = await store.listSubscriptions(userId);
  const subscription = chooseEffectiveSubscription(
    config,
    subscriptions,
    currentTime,
  );
  const planId = subscription?.planId || "free";
  let period;
  try {
    period = accessPeriodFor({
      planId,
      subscription,
      now: currentTime,
    });
  } catch {
    // A malformed paid billing period must not produce unlimited access.
    period = accessPeriodFor({
      planId: "free",
      subscription: null,
      now: currentTime,
    });
    return { planId: "free", subscription: null, period };
  }
  return { planId, subscription, period };
}

function normalizeSubscriptionInvoice(resource) {
  if (!resource || resource.type !== "subscription-invoices") {
    throw webhookPayloadInvalid();
  }
  const attributes = resource.attributes;
  const id = safePositiveId(resource.id);
  const storeId = safePositiveId(attributes?.store_id);
  const subscriptionId = safePositiveId(attributes?.subscription_id);
  const status = String(attributes?.status || "");
  const billingReason = String(attributes?.billing_reason || "");
  const createdAt = requiredDate(attributes?.created_at);
  const updatedAt = requiredDate(attributes?.updated_at);
  if (
    !id ||
    !storeId ||
    !subscriptionId ||
    !["pending", "paid", "void", "refunded", "partial_refund"].includes(status) ||
    !["initial", "renewal", "updated"].includes(billingReason) ||
    !createdAt ||
    !updatedAt ||
    typeof attributes?.test_mode !== "boolean"
  ) {
    throw webhookPayloadInvalid();
  }
  return {
    id,
    storeId,
    subscriptionId,
    status,
    billingReason,
    createdAt,
    updatedAt,
    testMode: attributes.test_mode,
  };
}

function normalizeSubscription(resource) {
  if (!resource || resource.type !== "subscriptions") {
    throw webhookPayloadInvalid();
  }
  const attributes = resource.attributes;
  const id = safePositiveId(resource.id);
  const storeId = safePositiveId(attributes?.store_id);
  const productId = safePositiveId(attributes?.product_id);
  const variantId = safePositiveId(attributes?.variant_id);
  const customerId = safePositiveId(attributes?.customer_id);
  const orderId = safePositiveId(attributes?.order_id);
  const status = String(attributes?.status || "");
  const createdAt = requiredDate(attributes?.created_at);
  const updatedAt = requiredDate(attributes?.updated_at);
  const renewsAt = optionalDate(attributes?.renews_at);
  const endsAt = optionalDate(attributes?.ends_at);
  const trialEndsAt = optionalDate(attributes?.trial_ends_at);

  if (
    !id ||
    !storeId ||
    !productId ||
    !variantId ||
    !customerId ||
    !orderId ||
    !SUBSCRIPTION_STATUSES.has(status) ||
    !createdAt ||
    !updatedAt ||
    typeof attributes?.test_mode !== "boolean"
  ) {
    throw webhookPayloadInvalid();
  }

  return {
    id,
    storeId,
    productId,
    variantId,
    customerId,
    orderId,
    status,
    testMode: attributes.test_mode,
    renewsAt,
    endsAt,
    trialEndsAt,
    createdAt,
    updatedAt,
  };
}

function verifyWebhookSignature(rawBody, signature, secret) {
  const provided = String(signature || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) {
    throw publicError(
      401,
      "Webhook signature is invalid.",
      "WEBHOOK_SIGNATURE_INVALID",
    );
  }
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw publicError(
      401,
      "Webhook signature is invalid.",
      "WEBHOOK_SIGNATURE_INVALID",
    );
  }
}

function requireTesterAccess(config, userId) {
  if (!isBillingEnforcedForUser(config, userId)) {
    throw publicError(404, "Not found.", "NOT_FOUND");
  }
}

function safeClerkUserId(value) {
  const userId = String(value || "");
  return /^user_[A-Za-z0-9]{10,80}$/.test(userId) ? userId : "";
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

function safePositiveId(value) {
  const id = String(value ?? "");
  return /^[1-9]\d*$/.test(id) ? id : "";
}

function safeEventName(value) {
  const name = String(value || "");
  return /^[a-z][a-z0-9_]{0,80}$/.test(name) ? name : "";
}

function safeResourceType(value) {
  const type = String(value || "");
  return /^[a-z][a-z0-9_-]{0,80}$/.test(type) ? type : "";
}

function requiredDate(value) {
  const date = optionalDate(value);
  return date || null;
}

function optionalDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoOrNull(value) {
  return optionalDate(value)?.toISOString() || null;
}

function webhookPayloadInvalid() {
  return publicError(
    400,
    "Webhook payload is invalid.",
    "WEBHOOK_PAYLOAD_INVALID",
  );
}

function publicError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

export const billingPlanPolicy = BILLING_PLANS;
