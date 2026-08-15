export class UserRateLimiter {
  constructor({
    windowMs,
    maxRequests,
    maxConcurrent,
    maxTrackedUsers = 50000,
    scope = "user",
    now = Date.now,
  }) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.maxConcurrent = maxConcurrent;
    this.maxTrackedUsers = maxTrackedUsers;
    this.scope = scope;
    this.now = now;
    this.users = new Map();
  }

  acquire(userId) {
    const now = this.now();
    let current = this.users.get(userId);

    if (!current && this.users.size >= this.maxTrackedUsers) {
      this.cleanupExpired();
      current = this.users.get(userId);
      if (!current && this.users.size >= this.maxTrackedUsers) {
        throw rateLimitError(
          "The analysis service is at capacity. Please try again shortly.",
          1,
          "RATE_LIMIT_CAPACITY",
        );
      }
    }

    const state = !current || current.windowStartedAt + this.windowMs <= now
      ? { windowStartedAt: now, requestCount: 0, concurrent: current?.concurrent || 0 }
      : current;

    if (state.concurrent >= this.maxConcurrent) {
      throw rateLimitError(
        this.scope === "global"
          ? "The analysis service is busy. Please try again shortly."
          : this.scope === "account"
            ? "Another account operation is already running. Please try again shortly."
          : "You already have the maximum number of analyses running.",
        1,
        this.scope === "global"
          ? "GLOBAL_CONCURRENCY_LIMITED"
          : this.scope === "account"
            ? "ACCOUNT_OPERATION_BUSY"
          : "RATE_LIMITED",
      );
    }

    if (state.requestCount >= this.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.windowStartedAt + this.windowMs - now) / 1000),
      );
      throw rateLimitError(
        this.scope === "global"
          ? "The analysis service is receiving too many requests. Please try again shortly."
          : this.scope === "account"
            ? "Too many account operations were requested. Please wait and try again."
          : "Too many analyses were requested. Please wait and try again.",
        retryAfterSeconds,
        this.scope === "global"
          ? "GLOBAL_RATE_LIMITED"
          : this.scope === "account"
            ? "ACCOUNT_RATE_LIMITED"
            : "RATE_LIMITED",
      );
    }

    state.requestCount += 1;
    state.concurrent += 1;
    this.users.set(userId, state);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const latest = this.users.get(userId);
      if (!latest) return;
      latest.concurrent = Math.max(0, latest.concurrent - 1);
      if (
        latest.concurrent === 0 &&
        latest.windowStartedAt + this.windowMs <= this.now()
      ) {
        this.users.delete(userId);
      }
    };
  }

  cleanupExpired() {
    const now = this.now();
    for (const [userId, state] of this.users) {
      if (
        state.concurrent === 0 &&
        state.windowStartedAt + this.windowMs <= now
      ) {
        this.users.delete(userId);
      }
    }
  }

  reset(userId) {
    this.users.delete(userId);
  }
}

function rateLimitError(message, retryAfterSeconds, code = "RATE_LIMITED") {
  const error = new Error(message);
  error.status = 429;
  error.code = code;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}
