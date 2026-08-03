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

const PAID_ACCESS_STATES = new Set(["active", "cancel_at_period_end"]);

export function isBillingEnforcedForUser(config, userId) {
  if (config.billingMode === "live") return true;
  if (config.billingMode !== "test") return false;
  return config.billingTesterUserIds.has(userId);
}

export function planForWhopPlan(config, whopPlanId, whopProductId) {
  const planId = String(whopPlanId || "");
  const productId = String(whopProductId || "");
  if (
    planId === config.whopPlusPlanId &&
    productId === config.whopPlusProductId
  ) {
    return "plus";
  }
  if (
    planId === config.whopUltraPlanId &&
    productId === config.whopUltraProductId
  ) {
    return "ultra";
  }
  return null;
}

export function whopCatalogForPlan(config, planId) {
  if (planId === "plus") {
    return {
      planId: config.whopPlusPlanId,
      productId: config.whopPlusProductId,
    };
  }
  if (planId === "ultra") {
    return {
      planId: config.whopUltraPlanId,
      productId: config.whopUltraProductId,
    };
  }
  return null;
}

export function isSubscriptionEntitled(subscription, now = new Date()) {
  if (!subscription || !PAID_ACCESS_STATES.has(subscription.status)) {
    return false;
  }
  if (subscription.status === "active") return true;
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
      planId: planForWhopPlan(
        config,
        subscription.providerPlanId,
        subscription.providerProductId,
      ),
    }))
    .filter((subscription) => subscription.planId)
    .sort((left, right) => {
      const allowanceDifference =
        BILLING_PLANS[right.planId].allowance -
        BILLING_PLANS[left.planId].allowance;
      if (allowanceDifference) return allowanceDifference;
      return asTimestamp(right.updatedAt) - asTimestamp(left.updatedAt);
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
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
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
    throw new Error("A paid access period requires a membership.");
  }

  const periodEnd = asDate(subscription.endsAt || subscription.renewsAt);
  const periodStart = asDate(subscription.periodStartedAt);
  if (!periodStart || !periodEnd || periodEnd.getTime() <= now.getTime()) {
    throw new Error("The paid membership has no active billing period.");
  }

  return {
    // Whop payment.succeeded is the only webhook allowed to advance
    // periodStartedAt after initial activation. Failed retry events therefore
    // cannot reset a user's quota.
    key: `membership:${subscription.id}:${periodStart.toISOString()}`,
    startsAt: periodStart,
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
