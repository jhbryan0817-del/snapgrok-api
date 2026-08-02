import { randomUUID } from "node:crypto";

export function createAnalysisJobManager({
  analyze,
  billingService,
  userRateLimiter,
  globalRequestLimiter,
  resolveAnalysisAccess,
  config,
  now = () => Date.now(),
  randomUUIDFn = randomUUID,
}) {
  const jobs = new Map();

  async function create({ auth, body, requestId }) {
    cleanup();
    // The global limiter is intentionally a single shared bucket. Using a
    // route-specific key here creates a second tracked bucket and trips
    // RATE_LIMIT_CAPACITY when maxTrackedUsers is one.
    const releaseGlobal = globalRequestLimiter.acquire("protected-api");
    let releaseUser = null;
    let access = null;

    try {
      releaseUser = userRateLimiter.acquire(auth.userId);
      access = validateAccess(
        config,
        await (resolveAnalysisAccess
          ? resolveAnalysisAccess({
              userId: auth.userId,
              sessionId: auth.sessionId,
              organizationId: auth.organizationId || null,
              operationId: body.operationId || null,
              requestId,
              defaultModel: config.model,
            })
          : billingService.reserveAnalysis({
              userId: auth.userId,
              operationId: body.operationId,
              defaultModel: config.model,
            })),
      );
    } catch (error) {
      releaseUser?.();
      releaseGlobal();
      throw error;
    }

    const createdAt = now();
    const job = {
      id: randomUUIDFn(),
      userId: auth.userId,
      deviceSessionId: auth.deviceSessionId,
      status: "processing",
      createdAt,
      processingExpiresAt: createdAt + config.analysisJobTimeoutMs,
      retentionExpiresAt: createdAt + config.analysisJobTimeoutMs,
      pollAfterMs: config.analysisPollIntervalMs,
      result: null,
      error: null,
      controller: new AbortController(),
      body,
      access,
      releaseUser,
      releaseGlobal,
      reservationSettled: false,
    };
    jobs.set(job.id, job);
    void run(job);

    return {
      jobId: job.id,
      status: "processing",
      pollAfterMs: job.pollAfterMs,
      expiresAt: new Date(job.processingExpiresAt).toISOString(),
    };
  }

  async function run(job) {
    const timeoutId = setTimeout(() => {
      job.controller.abort(
        new DOMException("The analysis job timed out.", "TimeoutError"),
      );
    }, config.analysisJobTimeoutMs);

    try {
      const result = await analyze({
        apiKey: config.apiKey,
        model: job.access.model,
        timeoutMs: Math.min(config.timeoutMs, config.analysisJobTimeoutMs),
        imageDataUrl: job.body.imageDataUrl,
        instruction:
          typeof job.body.instruction === "string"
            ? job.body.instruction.trim()
            : "",
        shortcutName: String(job.body.shortcutName || "").trim(),
        mockMode: config.mockMode,
        signal: job.controller.signal,
      });
      await billingService.consumeAnalysis({
        userId: job.userId,
        reservation: job.access.reservation || null,
      });
      job.reservationSettled = true;
      job.result = result;
      job.status = "complete";
    } catch (error) {
      job.error ||= normalizeJobError(error);
      job.status = job.controller.signal.aborted ? "cancelled" : "failed";
    } finally {
      clearTimeout(timeoutId);
      if (job.access?.reservation && !job.reservationSettled) {
        await billingService.releaseAnalysis({
          userId: job.userId,
          reservation: job.access.reservation,
        }).catch(() => undefined);
      }
      clearSensitiveBody(job.body);
      job.body = null;
      job.controller = null;
      job.releaseUser?.();
      job.releaseGlobal?.();
      job.releaseUser = null;
      job.releaseGlobal = null;
      job.retentionExpiresAt = now() + config.analysisJobRetentionMs;
    }
  }

  function get({ jobId, auth }) {
    cleanup();
    const job = ownedJob(jobId, auth);
    if (job.status === "processing") {
      return {
        httpStatus: 202,
        payload: {
          ok: true,
          jobId: job.id,
          status: "processing",
          pollAfterMs: job.pollAfterMs,
          expiresAt: new Date(job.processingExpiresAt).toISOString(),
        },
      };
    }
    if (job.status === "complete") {
      return {
        httpStatus: 200,
        payload: { ok: true, jobId: job.id, ...job.result },
      };
    }
    throw job.error || jobError(
      410,
      "ANALYSIS_JOB_CANCELLED",
      "The analysis request was cancelled.",
    );
  }

  function cancel({ jobId, auth, reason = "The extension cancelled the request." }) {
    cleanup();
    const job = ownedJob(jobId, auth);
    if (job.status === "processing" && job.controller) {
      job.error = jobError(410, "ANALYSIS_JOB_CANCELLED", reason);
      job.controller.abort(new DOMException(reason, "AbortError"));
    }
    return { cancelled: job.status === "processing" };
  }

  function cancelForUser(userId, reason = "The signed-in session ended.") {
    let cancelled = 0;
    for (const job of jobs.values()) {
      if (job.userId !== userId || job.status !== "processing" || !job.controller) {
        continue;
      }
      job.error = jobError(410, "ANALYSIS_JOB_CANCELLED", reason);
      job.controller.abort(new DOMException(reason, "AbortError"));
      cancelled += 1;
    }
    return cancelled;
  }

  function cancelForDevice(
    deviceSessionId,
    reason = "The extension session ended.",
  ) {
    let cancelled = 0;
    for (const job of jobs.values()) {
      if (
        job.deviceSessionId !== deviceSessionId ||
        job.status !== "processing" ||
        !job.controller
      ) {
        continue;
      }
      job.error = jobError(410, "ANALYSIS_JOB_CANCELLED", reason);
      job.controller.abort(new DOMException(reason, "AbortError"));
      cancelled += 1;
    }
    return cancelled;
  }

  function ownedJob(jobId, auth) {
    const job = jobs.get(String(jobId || ""));
    if (
      !job ||
      job.userId !== auth.userId ||
      job.deviceSessionId !== auth.deviceSessionId
    ) {
      throw jobError(
        404,
        "ANALYSIS_JOB_NOT_FOUND",
        "The analysis job was not found.",
      );
    }
    return job;
  }

  function cleanup() {
    const current = now();
    for (const [jobId, job] of jobs) {
      if (job.status !== "processing" && job.retentionExpiresAt <= current) {
        jobs.delete(jobId);
      }
    }
  }

  function close() {
    for (const job of jobs.values()) {
      if (job.status === "processing" && job.controller) {
        job.error = jobError(
          503,
          "ANALYSIS_SERVICE_RESTARTED",
          "The analysis service restarted before the request completed.",
        );
        job.controller.abort(
          new DOMException("The analysis service is stopping.", "AbortError"),
        );
      }
    }
  }

  return {
    create,
    get,
    cancel,
    cancelForUser,
    cancelForDevice,
    cleanup,
    close,
  };
}

function validateAccess(config, access) {
  if (!access || access.allowed !== true) {
    throw jobError(
      403,
      "ANALYSIS_ACCESS_DENIED",
      "Your account cannot run this analysis.",
    );
  }
  if (!config.allowedModels.has(access.model)) {
    throw jobError(
      500,
      "ANALYSIS_ACCESS_INVALID",
      "The analysis access policy selected an unsupported model.",
    );
  }
  return access;
}

function normalizeJobError(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return jobError(
      504,
      "ANALYSIS_JOB_TIMEOUT",
      "The server request exceeded the processing limit.",
    );
  }
  if (
    Number.isInteger(error?.status) &&
    error.status >= 400 &&
    error.status <= 599 &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(String(error?.code || ""))
  ) {
    return error;
  }
  return jobError(
    500,
    "ANALYSIS_JOB_FAILED",
    "The analysis service could not complete the request.",
  );
}

function jobError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function clearSensitiveBody(body) {
  if (!body || typeof body !== "object") return;
  body.imageDataUrl = "";
  body.instruction = "";
  body.shortcutName = "";
}
