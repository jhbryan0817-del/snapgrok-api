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
            : this.scope === "webhook"
              ? "The billing webhook is busy. Please retry shortly."
          : "You already have the maximum number of analyses running.",
        1,
        this.scope === "global"
          ? "GLOBAL_CONCURRENCY_LIMITED"
          : this.scope === "account"
            ? "ACCOUNT_OPERATION_BUSY"
            : this.scope === "webhook"
              ? "WEBHOOK_CONCURRENCY_LIMITED"
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
            : this.scope === "webhook"
              ? "Too many webhook deliveries were received. Please retry shortly."
          : "Too many analyses were requested. Please wait and try again.",
        retryAfterSeconds,
        this.scope === "global"
          ? "GLOBAL_RATE_LIMITED"
          : this.scope === "account"
            ? "ACCOUNT_RATE_LIMITED"
            : this.scope === "webhook"
              ? "WEBHOOK_RATE_LIMITED"
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

export class WeightedCapacityLimiter {
  constructor({ maxWeight, scope = "analysis" }) {
    if (!Number.isSafeInteger(maxWeight) || maxWeight < 1) {
      throw new Error("Weighted capacity must be a positive safe integer.");
    }
    this.maxWeight = maxWeight;
    this.scope = scope;
    this.activeWeight = 0;
  }

  acquire(weight) {
    if (!Number.isSafeInteger(weight) || weight < 1) {
      throw new Error("Capacity weight must be a positive safe integer.");
    }
    if (weight > this.maxWeight || this.activeWeight + weight > this.maxWeight) {
      throw rateLimitError(
        "The analysis service is processing its safe image-data capacity. Please try again shortly.",
        1,
        "ANALYSIS_MEMORY_LIMITED",
      );
    }

    this.activeWeight += weight;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeWeight = Math.max(0, this.activeWeight - weight);
    };
  }

  snapshot() {
    return {
      scope: this.scope,
      activeWeight: this.activeWeight,
      maxWeight: this.maxWeight,
    };
  }
}

export class AdaptiveCapacityLimiter {
  constructor({
    maxConcurrent,
    minConcurrent = 1,
    recoveryMs = 30000,
    now = Date.now,
  }) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("Adaptive capacity maximum must be a positive safe integer.");
    }
    if (
      !Number.isSafeInteger(minConcurrent) ||
      minConcurrent < 1 ||
      minConcurrent > maxConcurrent
    ) {
      throw new Error("Adaptive capacity minimum must not exceed its maximum.");
    }
    if (!Number.isSafeInteger(recoveryMs) || recoveryMs < 1) {
      throw new Error("Adaptive capacity recovery interval must be positive.");
    }
    this.maxConcurrent = maxConcurrent;
    this.minConcurrent = minConcurrent;
    this.recoveryMs = recoveryMs;
    this.now = now;
    this.currentLimit = maxConcurrent;
    this.active = 0;
    this.pressureUntil = 0;
    this.lastRecoveryAt = now();
    this.lastPressureReason = "none";
  }

  acquire() {
    this.recover();
    if (this.active >= this.currentLimit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(Math.max(0, this.pressureUntil - this.now()) / 1000),
      );
      throw rateLimitError(
        "The analysis service is protecting response time while a dependency is under pressure. Please retry shortly.",
        retryAfterSeconds,
        "ANALYSIS_ADAPTIVELY_LIMITED",
      );
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
    };
  }

  recordPressure(reason, { factor = 0.75, cooldownMs = this.recoveryMs } = {}) {
    const safeFactor = Number.isFinite(Number(factor))
      ? Math.min(0.95, Math.max(0.25, Number(factor)))
      : 0.75;
    const safeCooldown = Number.isSafeInteger(cooldownMs) && cooldownMs > 0
      ? cooldownMs
      : this.recoveryMs;
    const timestamp = this.now();
    this.currentLimit = Math.max(
      this.minConcurrent,
      Math.min(this.currentLimit - 1, Math.floor(this.currentLimit * safeFactor)),
    );
    this.pressureUntil = Math.max(this.pressureUntil, timestamp + safeCooldown);
    this.lastRecoveryAt = this.pressureUntil;
    this.lastPressureReason = safePressureReason(reason);
    return this.snapshot();
  }

  recover() {
    const timestamp = this.now();
    if (timestamp < this.pressureUntil || this.currentLimit >= this.maxConcurrent) {
      return;
    }
    const steps = Math.floor((timestamp - this.lastRecoveryAt) / this.recoveryMs);
    if (steps < 1) return;
    this.currentLimit = Math.min(this.maxConcurrent, this.currentLimit + steps);
    this.lastRecoveryAt += steps * this.recoveryMs;
    if (this.currentLimit === this.maxConcurrent) {
      this.lastPressureReason = "none";
    }
  }

  snapshot() {
    this.recover();
    return {
      active: this.active,
      currentLimit: this.currentLimit,
      minConcurrent: this.minConcurrent,
      maxConcurrent: this.maxConcurrent,
      pressureUntil: this.pressureUntil,
      lastPressureReason: this.lastPressureReason,
    };
  }
}

function safePressureReason(value) {
  const reason = String(value || "unknown").trim().toLowerCase();
  return /^[a-z0-9_-]{1,48}$/.test(reason) ? reason : "unknown";
}

function rateLimitError(message, retryAfterSeconds, code = "RATE_LIMITED") {
  const error = new Error(message);
  error.status = 429;
  error.code = code;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}
