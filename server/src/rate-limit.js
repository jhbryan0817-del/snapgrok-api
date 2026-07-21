export class UserRateLimiter {
  constructor({ windowMs, maxRequests, maxConcurrent, now = Date.now }) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.maxConcurrent = maxConcurrent;
    this.now = now;
    this.users = new Map();
  }

  acquire(userId) {
    const now = this.now();
    const current = this.users.get(userId);
    const state = !current || current.windowStartedAt + this.windowMs <= now
      ? { windowStartedAt: now, requestCount: 0, concurrent: current?.concurrent || 0 }
      : current;

    if (state.concurrent >= this.maxConcurrent) {
      throw rateLimitError(
        "You already have the maximum number of analyses running.",
        1,
      );
    }

    if (state.requestCount >= this.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.windowStartedAt + this.windowMs - now) / 1000),
      );
      throw rateLimitError(
        "Too many analyses were requested. Please wait and try again.",
        retryAfterSeconds,
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
}

function rateLimitError(message, retryAfterSeconds) {
  const error = new Error(message);
  error.status = 429;
  error.code = "RATE_LIMITED";
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}
