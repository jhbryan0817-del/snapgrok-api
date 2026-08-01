/**
 * @typedef {"free" | "plus" | "ultra"} PlanId
 */

/**
 * @param {PlanId} target
 * @param {PlanId | null} current
 * @param {string} fallback
 */
export function planActionLabel(target, current, fallback) {
  if (!current) return fallback;
  if (target === current) return "Current plan";
  if (target === "free") return "Switch to Free";
  if (current === "free") {
    return target === "plus" ? "Upgrade to Plus" : "Upgrade to Ultra";
  }
  return target === "ultra" ? "Upgrade to Ultra" : "Switch to Plus";
}

/**
 * Paid-plan changes remain display-only until subscription proration,
 * scheduling, and webhook reconciliation are implemented.
 *
 * @param {PlanId | null} current
 * @param {PlanId} target
 */
export function isPaidPlanChange(current, target) {
  return Boolean(current) && current !== "free" && current !== target;
}
