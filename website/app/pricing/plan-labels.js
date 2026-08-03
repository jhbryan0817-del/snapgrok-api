/**
 * @typedef {"free" | "plus" | "ultra"} PlanId
 */

/**
 * @param {PlanId} target
 * @param {PlanId | null} current
 * @param {string} fallback
 * @param {{status: string, cancelAtPeriodEnd: boolean} | null} [subscription]
 */
export function planActionLabel(target, current, fallback, subscription = null) {
  if (!current) return fallback;
  if (
    subscription?.status === "cancel_at_period_end" &&
    subscription.cancelAtPeriodEnd
  ) {
    return "Reactivate in account";
  }
  if (subscription?.status === "active") {
    return target === current ? "Current plan" : "Active subscription";
  }
  if (target === current) return "Current plan";
  if (target === "free") return "Switch to Free";
  if (current === "free") {
    return target === "plus" ? "Upgrade to Plus" : "Upgrade to Ultra";
  }
  if (current === "plus" && target === "ultra") return "Buy Ultra separately";
  return "Unavailable while Ultra is active";
}

/**
 * Plus-to-Ultra is a separate new subscription checkout. Free transitions and
 * Ultra-to-Plus remain account/display actions rather than provider changes.
 *
 * @param {PlanId | null} current
 * @param {PlanId} target
 */
export function isPaidPlanChange(current, target) {
  if (!current || current === "free" || current === target) return false;
  return !(current === "plus" && target === "ultra");
}
