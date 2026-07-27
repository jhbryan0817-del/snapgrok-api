export const BILLING_PLANS = Object.freeze({
  free: Object.freeze({
    id: "free",
    name: "Free",
    allowance: 5,
    cadence: "day",
    model: "grok-4.3",
  }),
  plus: Object.freeze({
    id: "plus",
    name: "Plus",
    allowance: 200,
    cadence: "billing_period",
    model: "grok-4.3",
  }),
  ultra: Object.freeze({
    id: "ultra",
    name: "Ultra",
    allowance: 300,
    cadence: "billing_period",
    model: "grok-4.5",
  }),
});

const PAID_STATUS_WITH_ACCESS = new Set([
  "active",
  "on_trial",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
]);

export function isBillingEnforcedForUser(config, userId) {
  if (config.billingMode === "live") return true;
  if (config.billingMode !== "test") return false;
  return config.billingTesterUserIds.has(userId);
}

export function planForVariant(config, variantId) {
  const normalized = String(variantId || "");
  if (normalized === config.lemonPlusVariantId) return "plus";
  if (normalized === config.lemonUltraVariantId) return "ultra";
  return null;
}

export function variantForPlan(config, planId) {
  if (planId === "plus") return config.lemonPlusVariantId;
  if (planId === "ultra") return config.lemonUltraVariantId;
  return null;
}

export function isSubscriptionEntitled(subscription, now = new Date()) {
  if (!subscription || !PAID_STATUS_WITH_ACCESS.has(subscription.status)) {
    return false;
  }

  if (subscription.status !== "cancelled") return true;
  const endsAt = asDate(subscription.endsAt);
  return Boolean(endsAt && endsAt.getTime() > now.getTime());
}

export function chooseEffectiveSubscription(
  config,
  subscriptions,
  now = new Date(),
) {
  return subscriptions
    .filter((subscription) => isSubscriptionEntitled(subscription, now))
    .map((subscription) => ({
      ...subscription,
      planId: planForVariant(config, subscription.variantId),
    }))
    .filter((subscription) => subscription.planId)
    .sort((left, right) => {
      const allowanceDifference =
        BILLING_PLANS[right.planId].allowance -
        BILLING_PLANS[left.planId].allowance;
      if (allowanceDifference) return allowanceDifference;
      return (
        asTimestamp(right.updatedAt) -
        asTimestamp(left.updatedAt)
      );
    })[0] || null;
}

export function accessPeriodFor({
  planId,
  subscription,
  now = new Date(),
}) {
  const plan = BILLING_PLANS[planId];
  if (!plan) throw new Error(`Unknown billing plan: ${planId}`);

  if (planId === "free") {
    const startsAt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      ),
    );
    const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
    return {
      key: `free:${startsAt.toISOString().slice(0, 10)}`,
      startsAt,
      endsAt,
      allowance: plan.allowance,
      model: plan.model,
    };
  }

  if (!subscription?.id) {
    throw new Error("A paid access period requires a subscription.");
  }

  const renewsAt = asDate(subscription.renewsAt);
  const endsAt = asDate(subscription.endsAt);
  const periodEnd =
    renewsAt && renewsAt.getTime() > now.getTime()
      ? renewsAt
      : endsAt && endsAt.getTime() > now.getTime()
        ? endsAt
        : null;
  if (!periodEnd) {
    throw new Error("The paid subscription has no current period end.");
  }

  return {
    // A plan change does not change this key, so consumed usage is preserved.
    // Lemon Squeezy can move renews_at to a retry date while payment is past
    // due. The server-maintained cycle start changes only after a successful
    // renewal invoice, so retries cannot reset quota.
    key: `subscription:${subscription.id}:${
      (asDate(subscription.periodStartedAt) || now).toISOString()
    }`,
    startsAt: asDate(subscription.periodStartedAt) || now,
    endsAt: periodEnd,
    allowance: plan.allowance,
    model: plan.model,
  };
}

export function publicPlan(planId) {
  const plan = BILLING_PLANS[planId];
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    allowance: plan.allowance,
    cadence: plan.cadence,
    model: plan.model,
  };
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function asTimestamp(value) {
  return asDate(value)?.getTime() || 0;
}
