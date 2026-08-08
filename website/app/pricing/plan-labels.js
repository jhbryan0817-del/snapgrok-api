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
  return target === "plus" ? "Switch to Plus" : "Switch to Ultra";
}

/**
 * Every change away from an active paid plan is a renewal-cancellation flow.
 * A second paid checkout is not allowed until the current paid period ends.
 *
 * @param {PlanId | null} current
 * @param {PlanId} target
 */
export function isPaidPlanChange(current, target) {
  if (!current || current === "free" || current === target) return false;
  return true;
}
