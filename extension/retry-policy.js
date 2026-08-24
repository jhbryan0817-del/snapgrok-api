(() => {
  "use strict";

  const RETRYABLE_CAPACITY_CODES = new Set([
    "GLOBAL_CONCURRENCY_LIMITED",
    "GLOBAL_RATE_LIMITED",
    "ANALYSIS_MEMORY_LIMITED",
    "ANALYSIS_ADAPTIVELY_LIMITED",
  ]);

  function capacityRetryDelay({
    status,
    code,
    retryAfterHeader = "",
    attempt = 0,
    now = Date.now(),
    random = Math.random(),
  }) {
    if (Number(status) !== 429 || !RETRYABLE_CAPACITY_CODES.has(String(code || ""))) {
      return null;
    }
    const retryAfterMs = parseRetryAfter(retryAfterHeader, now);
    const fallbackMs = Math.min(5000, 750 * (2 ** Math.max(0, Number(attempt) || 0)));
    const jitterMs = Math.round(Math.min(1, Math.max(0, Number(random) || 0)) * 250);
    return Math.min(30000, Math.max(retryAfterMs, fallbackMs) + jitterMs);
  }

  function parseRetryAfter(value, now = Date.now()) {
    const text = String(value || "").trim();
    if (!text) return 0;
    if (/^\d+(?:\.\d+)?$/.test(text)) {
      return Math.min(30000, Math.max(0, Math.ceil(Number(text) * 1000)));
    }
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp)
      ? Math.min(30000, Math.max(0, timestamp - Number(now)))
      : 0;
  }

  self.SnapGrokRetryPolicy = Object.freeze({
    capacityRetryDelay,
    parseRetryAfter,
  });
})();
