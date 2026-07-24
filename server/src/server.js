import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAuthenticator } from "./auth.js";
import { loadEnv } from "./env.js";
import { UserRateLimiter } from "./rate-limit.js";
import { analyzeScreenshot, getPrepaidBalance } from "./xai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDirectory = path.resolve(__dirname, "..");

loadEnv(path.join(projectDirectory, ".env"));

export function createConfig(environment = process.env) {
  const allowedOrigins = new Set(parseCsv(environment.ALLOWED_ORIGINS));
  const configuredAuthorizedParties = parseCsv(
    environment.CLERK_AUTHORIZED_PARTIES,
  );

  return {
    port: positiveInteger(environment, "PORT", 8787),
    apiKey: String(environment.XAI_API_KEY || ""),
    model: String(environment.XAI_MODEL || "grok-4.5"),
    timeoutMs: positiveInteger(environment, "XAI_TIMEOUT_MS", 180000, 1000),
    maxRequestBytes:
      positiveInteger(environment, "MAX_REQUEST_MB", 15) * 1024 * 1024,
    mockMode: envBooleanFrom(environment, "MOCK_XAI", false),

    clerkJwtKey: normalizePem(environment.CLERK_JWT_KEY),
    clerkSecretKey: String(environment.CLERK_SECRET_KEY || "").trim(),
    clerkPublishableKey: String(
      environment.CLERK_PUBLISHABLE_KEY || "",
    ).trim(),
    requireProductionClerk: envBooleanFrom(
      environment,
      "REQUIRE_PRODUCTION_CLERK",
      false,
    ),
    clerkAuthorizedParties: configuredAuthorizedParties.length
      ? configuredAuthorizedParties
      : [...allowedOrigins],

    allowedOrigins,
    requireOrigin: envBooleanFrom(
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

    rateLimitWindowMs: positiveInteger(
      environment,
      "RATE_LIMIT_WINDOW_MS",
      60000,
      1000,
    ),
    rateLimitMaxRequests: positiveInteger(
      environment,
      "RATE_LIMIT_MAX_REQUESTS",
      10,
    ),
    maxConcurrentRequestsPerUser: positiveInteger(
      environment,
      "MAX_CONCURRENT_REQUESTS_PER_USER",
      1,
    ),
    maxInstructionCharacters: positiveInteger(
      environment,
      "MAX_INSTRUCTION_CHARACTERS",
      8000,
      100,
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
  }
}

export function createSneakSolveServer({
  config = createConfig(),
  authenticate,
  analyze = analyzeScreenshot,
  getBalance = getPrepaidBalance,
  limiter,
} = {}) {
  const authenticateRequest =
    authenticate ||
    createAuthenticator({
      secretKey: config.clerkSecretKey,
      publishableKey: config.clerkPublishableKey,
      jwtKey: config.clerkJwtKey,
      authorizedParties: config.clerkAuthorizedParties,
    });

  const userRateLimiter =
    limiter ||
    new UserRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
      maxConcurrent: config.maxConcurrentRequestsPerUser,
    });

  const cleanupTimer = setInterval(
    () => userRateLimiter.cleanupExpired?.(),
    5 * 60 * 1000,
  );
  cleanupTimer.unref();

  const server = http.createServer(async (request, response) => {
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
            version: "5.0.1",
            service: "sneaksolve-api",
            authRequired: true,
            persistentRequestStorage: false,
          },
          requestId,
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/balance") {
        enforceOrigin(config, request);
        const auth = await authenticateRequest(request);

        if (!config.adminUserIds.has(auth.userId)) {
          throw httpError(404, "Not found.", "NOT_FOUND");
        }

        const balance = await getBalance({
          managementApiKey: config.managementApiKey,
          teamId: config.teamId,
          outputUsdPerMillionTokens: config.outputUsdPerMillionTokens,
        });

        sendJson(config, request, response, 200, balance, requestId);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/analyze") {
        enforceOrigin(config, request);
        const auth = await authenticateRequest(request);
        const releaseRateLimit = userRateLimiter.acquire(auth.userId);
        const downstreamController = new AbortController();
        let body = null;

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

          const result = await analyze({
            apiKey: config.apiKey,
            model: config.model,
            timeoutMs: config.timeoutMs,
            imageDataUrl: body.imageDataUrl,
            instruction: body.instruction.trim(),
            shortcutName: String(body.shortcutName || "").trim(),
            mockMode: config.mockMode,
            signal: downstreamController.signal,
          });

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
          request.off("aborted", abortDownstream);
          response.off("close", abortDownstream);
          releaseRateLimit();
          clearSensitiveBody(body);
          body = null;
        }
        return;
      }

      throw httpError(404, "Not found.", "NOT_FOUND");
    } catch (error) {
      if (response.writableEnded || response.destroyed) return;

      const status = Number(error?.status) || 500;
      const retryAfterSeconds = Number(error?.retryAfterSeconds) || 0;

      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          requestId,
          method: request.method,
          path: url.pathname,
          status,
          code: error?.code || "INTERNAL_ERROR",
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
          code: error?.code || "INTERNAL_ERROR",
          requestId,
        },
        requestId,
        retryAfterSeconds ? { "Retry-After": retryAfterSeconds } : {},
      );
    }
  });

  server.once("close", () => clearInterval(cleanupTimer));
  return server;
}

// Compatibility alias for earlier tests and integrations.
export const createSnapGrokServer = createSneakSolveServer;

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

function positiveInteger(environment, name, fallback, minimum = 1) {
  const raw = Number(environment[name]);
  const value = Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return value >= minimum ? value : fallback;
}

function envBooleanFrom(environment, name, fallback) {
  const value = environment[name];
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
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

async function readJsonBody(config, request) {
  const contentType = String(request.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw httpError(415, "Content-Type must be application/json.", "UNSUPPORTED_CONTENT_TYPE");
  }

  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > config.maxRequestBytes) {
    throw requestTooLarge(config);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > config.maxRequestBytes) throw requestTooLarge(config);
    chunks.push(chunk);
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
  if (
    typeof body.imageDataUrl !== "string" ||
    !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(body.imageDataUrl)
  ) {
    throw httpError(
      400,
      "imageDataUrl must be a base64 JPEG, PNG, or WebP image data URL.",
      "INVALID_IMAGE",
    );
  }

  if (typeof body.instruction !== "string" || !body.instruction.trim()) {
    throw httpError(400, "instruction is required.", "INSTRUCTION_REQUIRED");
  }
  if (body.instruction.length > config.maxInstructionCharacters) {
    throw httpError(
      400,
      `instruction exceeds ${config.maxInstructionCharacters} characters.`,
      "INSTRUCTION_TOO_LONG",
    );
  }
  if (body.shortcutName !== undefined && typeof body.shortcutName !== "string") {
    throw httpError(400, "shortcutName must be a string when provided.", "INVALID_SHORTCUT_NAME");
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
  const status = Number(error?.status) || 500;
  if (status >= 500 && status !== 503) {
    return "The analysis service is temporarily unavailable.";
  }
  return error?.message || "Internal server error.";
}

async function startServer() {
  const config = createConfig();
  validateRuntimeConfig(config);
  const server = createSneakSolveServer({ config });
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`SneakSolve server is listening on port ${config.port}`);
    console.log(`Model: ${config.mockMode ? "mock-xai" : config.model}`);
    console.log("Clerk authentication and active-session checks: required");
    console.log(`Allowed origins configured: ${config.allowedOrigins.size}`);
    console.log(
      `Per-user rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs} ms`,
    );
    console.log("Persistent request storage: disabled");
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
