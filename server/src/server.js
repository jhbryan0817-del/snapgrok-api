import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAuthenticator } from "./auth.js";
import {
  createBillingService,
  createBypassBillingService,
} from "./billing-service.js";
import { createPostgresBillingStore } from "./billing-store.js";
import { loadEnv } from "./env.js";
import { createLemonSqueezyClient } from "./lemon-squeezy.js";
import { UserRateLimiter } from "./rate-limit.js";
import { analyzeScreenshot, getPrepaidBalance } from "./xai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDirectory = path.resolve(__dirname, "..");

loadEnv(path.join(projectDirectory, ".env"));

export function createConfig(environment = process.env) {
  const productionRuntime = String(environment.NODE_ENV || "").toLowerCase() === "production";
  const allowedOrigins = new Set(parseCsv(environment.ALLOWED_ORIGINS));
  const configuredAuthorizedParties = parseCsv(
    environment.CLERK_AUTHORIZED_PARTIES,
  );
  const model = String(environment.XAI_MODEL || "grok-4.5").trim();
  const configuredAllowedModels = parseCsv(environment.ALLOWED_XAI_MODELS);

  return {
    port: boundedInteger(environment, "PORT", 8787, 1, 65535),
    apiKey: String(environment.XAI_API_KEY || "").trim(),
    model,
    allowedModels: new Set(configuredAllowedModels.length ? configuredAllowedModels : [model]),
    timeoutMs: boundedInteger(
      environment,
      "XAI_TIMEOUT_MS",
      180000,
      1000,
      300000,
    ),
    managementTimeoutMs: boundedInteger(
      environment,
      "XAI_MANAGEMENT_TIMEOUT_MS",
      10000,
      1000,
      30000,
    ),
    maxRequestBytes:
      boundedInteger(environment, "MAX_REQUEST_MB", 15, 1, 25) * 1024 * 1024,
    mockMode: strictBooleanFrom(environment, "MOCK_XAI", false),

    clerkJwtKey: normalizePem(environment.CLERK_JWT_KEY),
    clerkSecretKey: String(environment.CLERK_SECRET_KEY || "").trim(),
    clerkPublishableKey: String(
      environment.CLERK_PUBLISHABLE_KEY || "",
    ).trim(),
    clerkAudience: parseCsv(environment.CLERK_AUDIENCE),
    clerkTimeoutMs: boundedInteger(
      environment,
      "CLERK_TIMEOUT_MS",
      10000,
      1000,
      30000,
    ),
    requireProductionClerk: strictBooleanFrom(
      environment,
      "REQUIRE_PRODUCTION_CLERK",
      productionRuntime,
    ),
    clerkAuthorizedParties: configuredAuthorizedParties.length
      ? configuredAuthorizedParties
      : [...allowedOrigins],

    allowedOrigins,
    requireOrigin: strictBooleanFrom(
      environment,
      "REQUIRE_ALLOWED_ORIGIN",
      true,
    ),

    adminUserIds: new Set(parseCsv(environment.ADMIN_USER_IDS)),
    managementApiKey: String(environment.XAI_MANAGEMENT_API_KEY || ""),
    teamId: String(environment.XAI_TEAM_ID || ""),
    outputUsdPerMillionTokens: String(
      environment.XAI_OUTPUT_USD_PER_MILLION_TOKENS || "",
    ),

    rateLimitWindowMs: boundedInteger(
      environment,
      "RATE_LIMIT_WINDOW_MS",
      60000,
      1000,
      86400000,
    ),
    rateLimitMaxRequests: boundedInteger(
      environment,
      "RATE_LIMIT_MAX_REQUESTS",
      10,
      1,
      10000,
    ),
    maxConcurrentRequestsPerUser: boundedInteger(
      environment,
      "MAX_CONCURRENT_REQUESTS_PER_USER",
      1,
      1,
      10,
    ),
    globalRateLimitMaxRequests: boundedInteger(
      environment,
      "GLOBAL_RATE_LIMIT_MAX_REQUESTS",
      3000,
      1,
      100000,
    ),
    maxConcurrentRequestsGlobal: boundedInteger(
      environment,
      "MAX_CONCURRENT_REQUESTS_GLOBAL",
      20,
      1,
      200,
    ),
    maxTrackedRateLimitUsers: boundedInteger(
      environment,
      "MAX_TRACKED_RATE_LIMIT_USERS",
      50000,
      100,
      1000000,
    ),
    maxInstructionCharacters: boundedInteger(
      environment,
      "MAX_INSTRUCTION_CHARACTERS",
      8000,
      100,
      16000,
    ),
    maxShortcutNameCharacters: boundedInteger(
      environment,
      "MAX_SHORTCUT_NAME_CHARACTERS",
      100,
      1,
      200,
    ),
    requestBodyTimeoutMs: boundedInteger(
      environment,
      "REQUEST_BODY_TIMEOUT_MS",
      30000,
      1000,
      120000,
    ),
    headersTimeoutMs: boundedInteger(
      environment,
      "HEADERS_TIMEOUT_MS",
      15000,
      1000,
      60000,
    ),
    requestTimeoutMs: boundedInteger(
      environment,
      "REQUEST_TIMEOUT_MS",
      240000,
      10000,
      360000,
    ),
    keepAliveTimeoutMs: boundedInteger(
      environment,
      "KEEP_ALIVE_TIMEOUT_MS",
      5000,
      1000,
      30000,
    ),
    maxHeaderBytes: boundedInteger(
      environment,
      "MAX_HEADER_BYTES",
      16384,
      8192,
      65536,
    ),

    billingMode: enumFrom(
      environment,
      "BILLING_MODE",
      "off",
      new Set(["off", "test", "live"]),
    ),
    billingTesterUserIds: new Set(
      parseCsv(environment.BILLING_TESTER_USER_IDS),
    ),
    billingWebsiteOrigin: String(
      environment.BILLING_WEBSITE_ORIGIN || "",
    ).trim().replace(/\/$/, ""),
    databaseUrl: String(environment.DATABASE_URL || "").trim(),
    databasePoolMax: boundedInteger(
      environment,
      "DATABASE_POOL_MAX",
      10,
      1,
      50,
    ),
    databaseConnectionTimeoutMs: boundedInteger(
      environment,
      "DATABASE_CONNECTION_TIMEOUT_MS",
      5000,
      1000,
      30000,
    ),
    databaseStatementTimeoutMs: boundedInteger(
      environment,
      "DATABASE_STATEMENT_TIMEOUT_MS",
      10000,
      1000,
      60000,
    ),
    lemonApiKey: String(environment.LEMONSQUEEZY_API_KEY || "").trim(),
    lemonWebhookSecret: String(
      environment.LEMONSQUEEZY_WEBHOOK_SECRET || "",
    ).trim(),
    lemonStoreId: positiveId(environment.LEMONSQUEEZY_STORE_ID),
    lemonProductId: positiveId(environment.LEMONSQUEEZY_PRODUCT_ID),
    lemonPlusVariantId: positiveId(
      environment.LEMONSQUEEZY_PLUS_VARIANT_ID,
    ),
    lemonUltraVariantId: positiveId(
      environment.LEMONSQUEEZY_ULTRA_VARIANT_ID,
    ),
    lemonStoreUrl: String(
      environment.LEMONSQUEEZY_STORE_URL || "",
    ).trim().replace(/\/$/, ""),
    billingApiTimeoutMs: boundedInteger(
      environment,
      "BILLING_API_TIMEOUT_MS",
      10000,
      1000,
      30000,
    ),
    billingWebhookMaxBytes:
      boundedInteger(
        environment,
        "BILLING_WEBHOOK_MAX_KB",
        256,
        16,
        1024,
      ) * 1024,
    billingReservationTtlMs: boundedInteger(
      environment,
      "BILLING_RESERVATION_TTL_MS",
      300000,
      60000,
      900000,
    ),
    billingWebhookRetentionDays: boundedInteger(
      environment,
      "BILLING_WEBHOOK_RETENTION_DAYS",
      30,
      1,
      90,
    ),
  };
}

export function validateRuntimeConfig(config) {
  const missing = [];

  if (!config.mockMode && !config.apiKey) missing.push("XAI_API_KEY");
  if (!config.clerkSecretKey) missing.push("CLERK_SECRET_KEY");
  if (!config.clerkPublishableKey) missing.push("CLERK_PUBLISHABLE_KEY");
  if (!config.clerkAuthorizedParties.length) {
    missing.push("CLERK_AUTHORIZED_PARTIES");
  }
  if (config.requireOrigin && config.allowedOrigins.size === 0) {
    missing.push("ALLOWED_ORIGINS");
  }

  if (missing.length) {
    throw new Error(
      `Required server configuration is missing: ${missing.join(", ")}.`,
    );
  }

  if (
    config.requireProductionClerk &&
    (
      !config.clerkSecretKey.startsWith("sk_live_") ||
      !config.clerkPublishableKey.startsWith("pk_live_")
    )
  ) {
    throw new Error(
      "Production Clerk enforcement requires matching sk_live_ and pk_live_ credentials.",
    );
  }

  if (config.requireProductionClerk && !config.requireOrigin) {
    throw new Error(
      "Production Clerk enforcement requires REQUIRE_ALLOWED_ORIGIN=true.",
    );
  }

  if (config.requireProductionClerk && config.mockMode) {
    throw new Error("MOCK_XAI cannot be enabled with production Clerk enforcement.");
  }

  if (
    !config.model ||
    !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(config.model) ||
    !config.allowedModels.has(config.model)
  ) {
    throw new Error(
      "XAI_MODEL must be a safe server-side model identifier included in ALLOWED_XAI_MODELS.",
    );
  }

  for (const model of config.allowedModels) {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(model)) {
      throw new Error(`ALLOWED_XAI_MODELS contains an invalid model identifier: ${model}.`);
    }
  }

  for (const audience of config.clerkAudience) {
    if (
      audience.length > 200 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(audience)
    ) {
      throw new Error(`CLERK_AUDIENCE contains an invalid value: ${audience}.`);
    }
  }

  if (config.headersTimeoutMs > config.requestTimeoutMs) {
    throw new Error("HEADERS_TIMEOUT_MS cannot exceed REQUEST_TIMEOUT_MS.");
  }

  if (config.billingMode !== "off") {
    const missingBilling = [];
    for (const [name, value] of [
      ["DATABASE_URL", config.databaseUrl],
      ["BILLING_WEBSITE_ORIGIN", config.billingWebsiteOrigin],
      ["LEMONSQUEEZY_API_KEY", config.lemonApiKey],
      ["LEMONSQUEEZY_WEBHOOK_SECRET", config.lemonWebhookSecret],
      ["LEMONSQUEEZY_STORE_ID", config.lemonStoreId],
      ["LEMONSQUEEZY_PRODUCT_ID", config.lemonProductId],
      ["LEMONSQUEEZY_PLUS_VARIANT_ID", config.lemonPlusVariantId],
      ["LEMONSQUEEZY_ULTRA_VARIANT_ID", config.lemonUltraVariantId],
      ["LEMONSQUEEZY_STORE_URL", config.lemonStoreUrl],
    ]) {
      if (!value) missingBilling.push(name);
    }
    if (missingBilling.length) {
      throw new Error(
        `Billing configuration is missing: ${missingBilling.join(", ")}.`,
      );
    }
    if (
      config.billingMode === "test" &&
      config.billingTesterUserIds.size === 0
    ) {
      throw new Error(
        "BILLING_MODE=test requires at least one BILLING_TESTER_USER_IDS value.",
      );
    }
    for (const userId of config.billingTesterUserIds) {
      if (!/^user_[A-Za-z0-9]{10,80}$/.test(userId)) {
        throw new Error(
          "BILLING_TESTER_USER_IDS contains an invalid Clerk user ID.",
        );
      }
    }
    if (
      config.lemonPlusVariantId === config.lemonUltraVariantId ||
      !/^[1-9]\d*$/.test(config.lemonStoreId) ||
      !/^[1-9]\d*$/.test(config.lemonProductId) ||
      !/^[1-9]\d*$/.test(config.lemonPlusVariantId) ||
      !/^[1-9]\d*$/.test(config.lemonUltraVariantId)
    ) {
      throw new Error(
        "Lemon Squeezy store, product, and distinct variant IDs are required.",
      );
    }
    if (
      config.lemonWebhookSecret.length < 24 ||
      config.lemonWebhookSecret.length > 128
    ) {
      throw new Error(
        "LEMONSQUEEZY_WEBHOOK_SECRET must contain 24 to 128 characters.",
      );
    }
    if (config.lemonApiKey.length < 20) {
      throw new Error("LEMONSQUEEZY_API_KEY has an invalid length.");
    }
    requireDatabaseUrl(config.databaseUrl);
    requireExactHttpsOrigin(
      config.billingWebsiteOrigin,
      "BILLING_WEBSITE_ORIGIN",
    );
    requireExactHttpsOrigin(
      config.lemonStoreUrl,
      "LEMONSQUEEZY_STORE_URL",
    );
    if (
      !config.allowedOrigins.has(config.billingWebsiteOrigin) ||
      !config.clerkAuthorizedParties.includes(config.billingWebsiteOrigin)
    ) {
      throw new Error(
        "BILLING_WEBSITE_ORIGIN must be included in ALLOWED_ORIGINS and CLERK_AUTHORIZED_PARTIES.",
      );
    }
    for (const requiredModel of ["grok-4.3", "grok-4.5"]) {
      if (!config.allowedModels.has(requiredModel)) {
        throw new Error(
          `Billing requires ${requiredModel} in ALLOWED_XAI_MODELS.`,
        );
      }
    }
  }

  for (const [name, origins] of [
    ["ALLOWED_ORIGINS", [...config.allowedOrigins]],
    ["CLERK_AUTHORIZED_PARTIES", config.clerkAuthorizedParties],
  ]) {
    const invalid = origins.find((origin) => !isExactSafeOrigin(origin));
    if (invalid) {
      throw new Error(
        `${name} contains an invalid origin: ${invalid}. Use an exact HTTPS, localhost, or chrome-extension origin without paths or wildcards.`,
      );
    }

    if (
      config.requireProductionClerk &&
      origins.some((origin) => origin.startsWith("http://"))
    ) {
      throw new Error(`${name} cannot contain HTTP origins in production.`);
    }
  }
}

export function createSneakSolveServer({
  config = createConfig(),
  authenticate,
  analyze = analyzeScreenshot,
  getBalance = getPrepaidBalance,
  limiter,
  globalLimiter,
  resolveAnalysisAccess,
  billing,
} = {}) {
  const authenticateRequest =
    authenticate ||
    createAuthenticator({
      secretKey: config.clerkSecretKey,
      publishableKey: config.clerkPublishableKey,
      jwtKey: config.clerkJwtKey,
      authorizedParties: config.clerkAuthorizedParties,
      audience: config.clerkAudience,
      timeoutMs: config.clerkTimeoutMs,
    });

  const userRateLimiter =
    limiter ||
    new UserRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
      maxConcurrent: config.maxConcurrentRequestsPerUser,
      maxTrackedUsers: config.maxTrackedRateLimitUsers,
      scope: "user",
    });
  const globalRequestLimiter =
    globalLimiter ||
    new UserRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.globalRateLimitMaxRequests,
      maxConcurrent: config.maxConcurrentRequestsGlobal,
      maxTrackedUsers: 1,
      scope: "global",
    });
  const billingService = billing || createBillingRuntime(config);

  const cleanupTimer = setInterval(
    () => {
      userRateLimiter.cleanupExpired?.();
      globalRequestLimiter.cleanupExpired?.();
      void billingService.maintenance?.().catch((error) => {
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            code: publicErrorCode(error),
            operation: "billing_maintenance",
          }),
        );
      });
    },
    5 * 60 * 1000,
  );
  cleanupTimer.unref();

  const server = http.createServer(
    { maxHeaderSize: config.maxHeaderBytes },
    async (request, response) => {
      const requestId = randomUUID();
      const startedAt = Date.now();
      const url = new URL(request.url || "/", "http://api.invalid");

      if (request.method === "OPTIONS") {
        try {
          enforceOrigin(config, request);
          setCommonHeaders(config, request, response, requestId);
          response.writeHead(204);
          response.end();
        } catch (error) {
          sendJson(
            config,
            request,
            response,
            error.status || 403,
            { ok: false, error: error.message, code: error.code },
            requestId,
          );
        }
        return;
      }

      try {
        if (request.method === "GET" && url.pathname === "/api/health") {
          sendJson(
            config,
            request,
            response,
            200,
            {
              ok: true,
              version: "5.3.0",
              service: "sneaksolve-api",
              authRequired: true,
              persistentRequestStorage:
                config.billingMode === "off"
                  ? false
                  : "billing-metadata-only",
              billingMode: config.billingMode,
            },
            requestId,
          );
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/billing/webhook"
        ) {
          requireSingleRequestHeader(request, "x-signature");
          requireSingleRequestHeader(request, "x-event-name");
          const rawBody = await readRawBody(
            request,
            config.billingWebhookMaxBytes,
            config.requestBodyTimeoutMs,
            "application/json",
          );
          const result = await billingService.handleWebhook({
            rawBody,
            signature: request.headers["x-signature"],
            headerEventName: request.headers["x-event-name"],
          });
          sendJson(
            config,
            request,
            response,
            200,
            { ok: true, ...result },
            requestId,
          );
          return;
        }

        if (
          request.method === "GET" &&
          url.pathname === "/api/billing/status"
        ) {
          enforceOrigin(config, request);
          const releaseGlobalLimit =
            globalRequestLimiter.acquire("protected-api");
          try {
            const auth = await authenticateRequest(request);
            const status = await billingService.status(auth.userId);
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...status },
              requestId,
            );
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/billing/checkout"
        ) {
          enforceOrigin(config, request);
          enforceBillingWebsiteOrigin(config, request);
          const releaseGlobalLimit =
            globalRequestLimiter.acquire("protected-api");
          try {
            const auth = await authenticateRequest(request);
            const body = await readJsonBody(config, request);
            validateCheckoutRequest(body);
            const checkout = await billingService.createCheckout({
              userId: auth.userId,
              planId: body.plan,
              email: body.email,
              name: body.name,
            });
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...checkout },
              requestId,
            );
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/billing/portal"
        ) {
          enforceOrigin(config, request);
          enforceBillingWebsiteOrigin(config, request);
          const releaseGlobalLimit =
            globalRequestLimiter.acquire("protected-api");
          try {
            const auth = await authenticateRequest(request);
            const body = await readJsonBody(config, request);
            if (Object.keys(body).length !== 0) {
              throw httpError(
                400,
                "Billing portal request must be empty.",
                "BILLING_PORTAL_REQUEST_INVALID",
              );
            }
            const portal = await billingService.customerPortal({
              userId: auth.userId,
            });
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...portal },
              requestId,
            );
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/balance") {
          enforceOrigin(config, request);
          const releaseGlobalLimit = globalRequestLimiter.acquire("protected-api");
          try {
            const auth = await authenticateRequest(request);

            if (!config.adminUserIds.has(auth.userId)) {
              throw httpError(404, "Not found.", "NOT_FOUND");
            }

            const balance = await getBalance({
              managementApiKey: config.managementApiKey,
              teamId: config.teamId,
              outputUsdPerMillionTokens: config.outputUsdPerMillionTokens,
              timeoutMs: config.managementTimeoutMs,
            });

            sendJson(config, request, response, 200, balance, requestId);
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/analyze") {
          enforceOrigin(config, request);
          const releaseGlobalLimit = globalRequestLimiter.acquire("protected-api");
          try {
            const auth = await authenticateRequest(request);
            const releaseRateLimit = userRateLimiter.acquire(auth.userId);
            const downstreamController = new AbortController();
            let body = null;
            let access = null;
            let reservationSettled = false;

            const abortDownstream = () => {
              if (!response.writableEnded) {
                downstreamController.abort(
                  new DOMException("The extension disconnected.", "AbortError"),
                );
              }
            };

            request.once("aborted", abortDownstream);
            response.once("close", abortDownstream);

            try {
              body = await readJsonBody(config, request);
              validateAnalyzeRequest(config, body);

              access = validateAnalysisAccess(
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

              const result = await analyze({
                apiKey: config.apiKey,
                model: access.model,
                timeoutMs: config.timeoutMs,
                imageDataUrl: body.imageDataUrl,
                instruction:
                  typeof body.instruction === "string"
                    ? body.instruction.trim()
                    : "",
                shortcutName: String(body.shortcutName || "").trim(),
                mockMode: config.mockMode,
                signal: downstreamController.signal,
              });

              await billingService.consumeAnalysis({
                userId: auth.userId,
                reservation: access.reservation || null,
              });
              reservationSettled = true;

              if (!downstreamController.signal.aborted && !response.writableEnded) {
                // Re-check Clerk after the potentially long xAI call. A session
                // ended while analysis was running must not receive the result.
                await authenticateRequest(request);
                sendJson(
                  config,
                  request,
                  response,
                  200,
                  { ok: true, ...result },
                  requestId,
                );
              }
            } finally {
              if (
                access?.reservation &&
                !reservationSettled
              ) {
                await billingService.releaseAnalysis({
                  userId: auth.userId,
                  reservation: access.reservation,
                }).catch((error) => {
                  console.error(
                    JSON.stringify({
                      timestamp: new Date().toISOString(),
                      requestId,
                      code: publicErrorCode(error),
                      operation: "billing_reservation_release",
                    }),
                  );
                });
              }
              request.off("aborted", abortDownstream);
              response.off("close", abortDownstream);
              releaseRateLimit();
              clearSensitiveBody(body);
              body = null;
            }
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        throw httpError(404, "Not found.", "NOT_FOUND");
      } catch (error) {
        if (response.writableEnded || response.destroyed) return;

        const status = normalizeHttpStatus(error?.status);
        const retryAfterSeconds = Number(error?.retryAfterSeconds) || 0;
        const errorCode = publicErrorCode(error);

        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId,
            method: request.method,
            path: url.pathname,
            status,
            code: errorCode,
            authReason: error?.authReason || undefined,
            durationMs: Date.now() - startedAt,
          }),
        );

        sendJson(
          config,
          request,
          response,
          status,
          {
            ok: false,
            error: publicErrorMessage(error),
            code: errorCode,
            requestId,
            ...(publicQuota(error) ? { quota: publicQuota(error) } : {}),
          },
          requestId,
          retryAfterSeconds ? { "Retry-After": retryAfterSeconds } : {},
        );
      }
    },
  );

  server.once("close", () => {
    clearInterval(cleanupTimer);
    void billingService.close?.().catch(() => {});
  });
  server.billingService = billingService;
  server.headersTimeout = config.headersTimeoutMs;
  server.requestTimeout = config.requestTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.maxHeadersCount = 64;
  return server;
}

// Compatibility alias for earlier tests and integrations.
export const createSnapGrokServer = createSneakSolveServer;

function validateAnalysisAccess(config, access) {
  if (!access || access.allowed !== true) {
    throw httpError(403, "Analysis access is not available.", "ANALYSIS_ACCESS_DENIED");
  }
  if (
    typeof access.model !== "string" ||
    !config.allowedModels.has(access.model)
  ) {
    throw httpError(
      500,
      "Analysis access returned an unsupported model.",
      "ANALYSIS_ACCESS_INVALID",
    );
  }
  return {
    model: access.model,
    reservation: access.reservation || null,
    planId: access.planId || "legacy",
  };
}

export function createBillingRuntime(config) {
  if (config.billingMode === "off") {
    return createBypassBillingService(config);
  }
  const store = createPostgresBillingStore({
    connectionString: config.databaseUrl,
    poolMax: config.databasePoolMax,
    connectionTimeoutMs: config.databaseConnectionTimeoutMs,
    statementTimeoutMs: config.databaseStatementTimeoutMs,
  });
  const lemonClient = createLemonSqueezyClient({
    apiKey: config.lemonApiKey,
    storeId: config.lemonStoreId,
    storeUrl: config.lemonStoreUrl,
    testMode: config.billingMode === "test",
    timeoutMs: config.billingApiTimeoutMs,
  });
  return createBillingService({ config, store, lemonClient });
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function normalizePem(value) {
  return String(value || "").trim().replace(/\\n/g, "\n");
}

function isExactSafeOrigin(value) {
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(value)) return true;

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.origin !== value || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

function requireExactHttpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an exact HTTPS origin.`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an exact HTTPS origin.`);
  }
}

function requireDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    !url.pathname ||
    url.pathname === "/"
  ) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
}

function boundedInteger(environment, name, fallback, minimum, maximum) {
  const raw = environment[name];
  if (raw == null || raw === "") return fallback;
  if (!/^\d+$/.test(String(raw).trim())) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function positiveId(value) {
  const id = String(value || "").trim();
  return /^[1-9]\d*$/.test(id) ? id : "";
}

function enumFrom(environment, name, fallback, allowed) {
  const value = String(environment[name] || fallback).trim().toLowerCase();
  if (!allowed.has(value)) {
    throw new Error(`${name} must be one of: ${[...allowed].join(", ")}.`);
  }
  return value;
}

function strictBooleanFrom(environment, name, fallback) {
  const value = environment[name];
  if (value == null || value === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  throw new Error(`${name} must be true or false.`);
}

function httpError(status, message, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

function requestOrigin(request) {
  return String(request.headers.origin || "").trim().replace(/\/$/, "");
}

function isOriginAllowed(config, origin) {
  return Boolean(origin && config.allowedOrigins.has(origin));
}

function setCommonHeaders(config, request, response, requestId) {
  const origin = requestOrigin(request);
  if (isOriginAllowed(config, origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }

  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (requestId) response.setHeader("X-Request-ID", requestId);
}

function sendJson(config, request, response, status, body, requestId, headers = {}) {
  setCommonHeaders(config, request, response, requestId);
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null && value !== "") {
      response.setHeader(name, String(value));
    }
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function enforceOrigin(config, request) {
  requireSingleRequestHeader(request, "origin");
  const origin = requestOrigin(request);
  if (!origin) {
    if (config.requireOrigin) {
      throw httpError(403, "Request origin is missing.", "ORIGIN_REQUIRED");
    }
    return;
  }
  if (!isOriginAllowed(config, origin)) {
    throw httpError(403, "Request origin is not allowed.", "ORIGIN_NOT_ALLOWED");
  }
}

function enforceBillingWebsiteOrigin(config, request) {
  if (requestOrigin(request) !== config.billingWebsiteOrigin) {
    throw httpError(
      403,
      "Billing actions are only available from the SneakSolve website.",
      "BILLING_ORIGIN_NOT_ALLOWED",
    );
  }
}

async function readRawBody(
  request,
  maximumBytes,
  timeoutMs,
  expectedContentType,
) {
  requireSingleRequestHeader(request, "content-type");
  requireSingleRequestHeader(request, "content-length");
  const contentType = String(request.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== expectedContentType) {
    throw httpError(
      415,
      `Content-Type must be ${expectedContentType}.`,
      "UNSUPPORTED_CONTENT_TYPE",
    );
  }
  const contentLength = request.headers["content-length"];
  if (contentLength != null) {
    if (!/^(?:0|[1-9]\d*)$/.test(String(contentLength))) {
      throw httpError(400, "Content-Length is invalid.", "INVALID_CONTENT_LENGTH");
    }
    if (Number(contentLength) > maximumBytes) {
      throw httpError(413, "Request body is too large.", "REQUEST_TOO_LARGE");
    }
  }

  const chunks = [];
  let total = 0;
  const timeout = setTimeout(() => {
    request.destroy(
      httpError(408, "Request body timed out.", "REQUEST_BODY_TIMEOUT"),
    );
  }, timeoutMs);
  try {
    for await (const chunk of request) {
      total += chunk.length;
      if (total > maximumBytes) {
        throw httpError(413, "Request body is too large.", "REQUEST_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!chunks.length) {
    throw httpError(400, "Request body is required.", "REQUEST_BODY_MISSING");
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(config, request) {
  requireSingleRequestHeader(request, "content-type");
  requireSingleRequestHeader(request, "content-length");
  const contentType = String(request.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw httpError(415, "Content-Type must be application/json.", "UNSUPPORTED_CONTENT_TYPE");
  }

  const contentLengthHeader = request.headers["content-length"];
  if (contentLengthHeader != null) {
    if (!/^(?:0|[1-9]\d*)$/.test(String(contentLengthHeader))) {
      throw httpError(400, "Content-Length is invalid.", "INVALID_CONTENT_LENGTH");
    }
    const contentLength = Number(contentLengthHeader);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > config.maxRequestBytes
    ) {
      throw requestTooLarge(config);
    }
  }

  const chunks = [];
  let total = 0;
  const timeout = setTimeout(() => {
    request.destroy(
      httpError(408, "Request body timed out.", "REQUEST_BODY_TIMEOUT"),
    );
  }, config.requestBodyTimeoutMs);
  try {
    for await (const chunk of request) {
      total += chunk.length;
      if (total > config.maxRequestBytes) throw requestTooLarge(config);
      chunks.push(chunk);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!chunks.length) {
    throw httpError(400, "Request body is required.", "REQUEST_BODY_MISSING");
  }

  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not-an-object");
    }
    return body;
  } catch {
    throw httpError(400, "Request body must be a JSON object.", "INVALID_JSON");
  }
}

function requestTooLarge(config) {
  return httpError(
    413,
    `Request exceeds ${Math.round(config.maxRequestBytes / 1024 / 1024)} MB.`,
    "REQUEST_TOO_LARGE",
  );
}

function validateAnalyzeRequest(config, body) {
  if (!isValidImageDataUrl(body.imageDataUrl)) {
    throw httpError(
      400,
      "imageDataUrl must be a base64 JPEG, PNG, or WebP image data URL.",
      "INVALID_IMAGE",
    );
  }

  if (
    body.instruction !== undefined &&
    typeof body.instruction !== "string"
  ) {
    throw httpError(
      400,
      "instruction must be a string when provided.",
      "INVALID_INSTRUCTION",
    );
  }
  if (
    typeof body.instruction === "string" &&
    body.instruction.length > config.maxInstructionCharacters
  ) {
    throw httpError(
      400,
      `instruction exceeds ${config.maxInstructionCharacters} characters.`,
      "INSTRUCTION_TOO_LONG",
    );
  }
  if (body.shortcutName !== undefined && typeof body.shortcutName !== "string") {
    throw httpError(400, "shortcutName must be a string when provided.", "INVALID_SHORTCUT_NAME");
  }
  if (
    typeof body.shortcutName === "string" &&
    body.shortcutName.length > config.maxShortcutNameCharacters
  ) {
    throw httpError(
      400,
      `shortcutName exceeds ${config.maxShortcutNameCharacters} characters.`,
      "SHORTCUT_NAME_TOO_LONG",
    );
  }
}

function validateCheckoutRequest(body) {
  const allowedKeys = new Set(["plan", "email", "name"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw httpError(
      400,
      "Checkout request contains unsupported fields.",
      "BILLING_CHECKOUT_REQUEST_INVALID",
    );
  }
  if (!["plus", "ultra"].includes(body.plan)) {
    throw httpError(400, "Unknown paid plan.", "BILLING_PLAN_INVALID");
  }
  if (
    body.email !== undefined &&
    (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(body.email)
    )
  ) {
    throw httpError(
      400,
      "Checkout email is invalid.",
      "BILLING_EMAIL_INVALID",
    );
  }
  if (
    body.name !== undefined &&
    (typeof body.name !== "string" || body.name.trim().length > 100)
  ) {
    throw httpError(
      400,
      "Checkout name is invalid.",
      "BILLING_NAME_INVALID",
    );
  }
}

function requireSingleRequestHeader(request, name) {
  const distinct = request.headersDistinct?.[name];
  const fallback = request.headers?.[name];
  const values = Array.isArray(distinct)
    ? distinct
    : Array.isArray(fallback)
      ? fallback
      : fallback == null
        ? []
        : [fallback];
  if (values.length <= 1) return;
  throw httpError(
    400,
    `Multiple ${name} headers are not allowed.`,
    "AMBIGUOUS_SECURITY_HEADER",
  );
}

function isValidImageDataUrl(value) {
  if (typeof value !== "string") return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\r\n]+)$/i.exec(
    value,
  );
  if (!match) return false;

  const encoded = match[2].replace(/\r?\n/g, "");
  if (
    encoded.length < 4 ||
    encoded.length % 4 !== 0 ||
    !/^[a-z0-9+/]*={0,2}$/i.test(encoded)
  ) {
    return false;
  }

  const decoded = Buffer.from(encoded, "base64");
  if (!decoded.length) return false;
  const canonical = decoded.toString("base64");
  if (canonical !== encoded) return false;

  switch (match[1].toLowerCase()) {
    case "jpeg":
      return (
        decoded.length >= 4 &&
        decoded[0] === 0xff &&
        decoded[1] === 0xd8 &&
        decoded[2] === 0xff &&
        decoded[decoded.length - 2] === 0xff &&
        decoded[decoded.length - 1] === 0xd9
      );
    case "png":
      return (
        decoded.length >= 24 &&
        decoded.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ) &&
        decoded.subarray(12, 16).toString("ascii") === "IHDR" &&
        decoded.readUInt32BE(16) > 0 &&
        decoded.readUInt32BE(20) > 0
      );
    case "webp":
      return (
        decoded.length >= 16 &&
        decoded.subarray(0, 4).toString("ascii") === "RIFF" &&
        decoded.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}

function clearSensitiveBody(body) {
  if (!body || typeof body !== "object") return;
  body.imageDataUrl = "";
  body.instruction = "";
  body.shortcutName = "";
  body.sourceUrl = "";
  body.sourceTitle = "";
}

function publicErrorMessage(error) {
  const status = normalizeHttpStatus(error?.status);
  if (status >= 500) {
    return "The analysis service is temporarily unavailable.";
  }
  return error?.message || "Internal server error.";
}

function publicQuota(error) {
  const quota = error?.quota;
  if (!quota || error?.code !== "QUOTA_EXHAUSTED") return null;
  const resetsAt = new Date(quota.resetsAt);
  if (!Number.isFinite(resetsAt.getTime())) return null;
  return {
    plan: ["free", "plus", "ultra"].includes(quota.planId)
      ? quota.planId
      : "free",
    allowance: Math.max(0, Number(quota.allowance) || 0),
    used: Math.max(0, Number(quota.used) || 0),
    reserved: Math.max(0, Number(quota.reserved) || 0),
    resetsAt: resetsAt.toISOString(),
  };
}

function normalizeHttpStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : 500;
}

function publicErrorCode(error) {
  const code = String(error?.code || "");
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "INTERNAL_ERROR";
}

async function startServer() {
  const config = createConfig();
  validateRuntimeConfig(config);
  const server = createSneakSolveServer({ config });
  await server.billingService.initialize();
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`SneakSolve server is listening on port ${config.port}`);
    console.log(`Model: ${config.mockMode ? "mock-xai" : config.model}`);
    console.log("Clerk authentication and active-session checks: required");
    console.log(`Allowed origins configured: ${config.allowedOrigins.size}`);
    console.log(
      `Per-user rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs} ms`,
    );
    console.log(`Billing mode: ${config.billingMode}`);
    console.log(
      config.billingMode === "off"
        ? "Persistent request storage: disabled"
        : "Persistent storage: billing metadata only; screenshots and prompts are not stored",
    );
  });
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
