// These counters measure upstream starts, including retries and cancelled work.
// They are separate from the customer's successful-question allowance.
export function inferenceBudgets(config, { userId, planId }, at = new Date()) {
  const startsAt = new Date(at);
  startsAt.setUTCHours(0, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 86400000);
  const day = startsAt.toISOString().slice(0, 10);
  const counter = (owner, key, limit, code, end = endsAt) => ({
    userId: owner, key, limit, code, startsAt, endsAt: end,
  });
  const budgets = [
    counter(userId, `xai-attempts:${config.billingMode}:${day}`,
      planId === "free" ? config.freeUserXaiAttemptsPerDay : config.paidUserXaiAttemptsPerDay,
      "ANALYSIS_ATTEMPT_LIMITED"),
    counter("__zenaian_xai_budget__", `all:${config.billingMode}:${day}`,
      config.globalXaiAttemptsPerDay, "ANALYSIS_DAILY_BUDGET_REACHED"),
  ];
  if (planId === "free") {
    budgets.push(counter("__zenaian_xai_budget__", `free:${config.billingMode}:${day}`,
      config.freeXaiAttemptsPerDay, "ANALYSIS_FREE_BUDGET_REACHED"));
  }
  if (config.canaryUserIds?.has(userId)) {
    // A run does not reset at midnight or on process restart. Retention keeps it
    // for 30 days; use a new run ID for a separately authorized future canary.
    budgets.push(counter("__zenaian_xai_canary__", `canary:${config.canaryRunId}`,
      config.canaryMaxXaiAttempts, "ANALYSIS_CANARY_BUDGET_REACHED",
      new Date(startsAt.getTime() + 30 * 86400000)));
  }
  return budgets;
}

export function inferenceBudgetError(budget) {
  return Object.assign(new Error("The analysis attempt limit has been reached. Please try again after the limit resets."), {
    status: 429,
    code: budget.code,
    retryAfterSeconds: Math.max(1, Math.ceil((budget.endsAt.getTime() - Date.now()) / 1000)),
  });
}
