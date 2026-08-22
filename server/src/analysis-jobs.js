import { randomUUID } from "node:crypto";

export function createAnalysisJobManager({
  analyze,
  billingService,
  userRateLimiter,
  globalRequestLimiter,
  resolveAnalysisAccess,
  config,
  performanceLogger = null,
  now = () => Date.now(),
  randomUUIDFn = randomUUID,
}) {
  const jobs = new Map();
  let activeJobs = 0;

  async function create({ auth, body, requestId }) {
    cleanup();
    const admissionStartedAt = now();
    const releaseGlobal = globalRequestLimiter.acquire("analysis");
    let releaseUser = null;
    let access = null;
    let accessStartedAt = null;

    try {
      releaseUser = userRateLimiter.acquire(auth.userId);
      accessStartedAt = now();
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
      performance: {
        startedAt: admissionStartedAt,
        admissionMs: Math.max(0, accessStartedAt - admissionStartedAt),
        accessMs: Math.max(0, now() - accessStartedAt),
        requestBytes: estimateAnalysisRequestBytes(body),
        activeAtStart: activeJobs + 1,
        xaiMs: 0,
        settlementMs: 0,
      },
    };
    jobs.set(job.id, job);
    activeJobs += 1;
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
    const xaiStartedAt = now();

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
        requireZeroDataRetention: config.requireXaiZdr,
        signal: job.controller.signal,
      });
      job.performance.xaiMs = Math.max(0, now() - xaiStartedAt);
      const settlementStartedAt = now();
      await billingService.consumeAnalysis({
        userId: job.userId,
        reservation: job.access.reservation || null,
      });
      job.performance.settlementMs = Math.max(0, now() - settlementStartedAt);
      job.reservationSettled = true;
      job.result = result;
      job.status = "complete";
    } catch (error) {
      job.performance.xaiMs ||= Math.max(0, now() - xaiStartedAt);
      job.error ||= normalizeJobError(error);
      job.status = job.controller.signal.aborted ? "cancelled" : "failed";
    } finally {
      clearTimeout(timeoutId);
      if (job.access?.reservation && !job.reservationSettled) {
        const settlementStartedAt = now();
        await billingService.releaseAnalysis({
          userId: job.userId,
          reservation: job.access.reservation,
        }).catch(() => undefined);
        job.performance.settlementMs = Math.max(0, now() - settlementStartedAt);
      }
      clearSensitiveBody(job.body);
      job.body = null;
      job.controller = null;
      job.releaseUser?.();
      job.releaseGlobal?.();
      job.releaseUser = null;
      job.releaseGlobal = null;
      job.retentionExpiresAt = now() + config.analysisJobRetentionMs;
      activeJobs = Math.max(0, activeJobs - 1);
      performanceLogger?.({
        transport: "async-job",
        status: job.status,
        totalMs: Math.max(0, now() - job.performance.startedAt),
        admissionMs: job.performance.admissionMs,
        accessMs: job.performance.accessMs,
        xaiMs: job.performance.xaiMs,
        settlementMs: job.performance.settlementMs,
        requestBytes: job.performance.requestBytes,
        activeAtStart: job.performance.activeAtStart,
        activeAfter: activeJobs,
      });
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
    for (const [jobId, job] of jobs) {
      if (job.userId !== userId) continue;
      if (job.status === "processing" && job.controller) {
        job.error = jobError(410, "ANALYSIS_JOB_CANCELLED", reason);
        job.controller.abort(new DOMException(reason, "AbortError"));
      }
      clearSensitiveBody(job.body);
      job.body = null;
      job.result = null;
      jobs.delete(jobId);
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

function estimateAnalysisRequestBytes(body) {
  if (!body || typeof body !== "object") return 0;
  return Buffer.byteLength(String(body.imageDataUrl || ""), "utf8") +
    Buffer.byteLength(String(body.instruction || ""), "utf8") +
    Buffer.byteLength(String(body.shortcutName || ""), "utf8");
}
