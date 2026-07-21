import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthenticator } from "./auth.js";
import { loadEnv } from "./env.js";
import { UserRateLimiter } from "./rate-limit.js";
import { analyzeScreenshot, getPrepaidBalance } from "./xai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDirectory = path.resolve(__dirname, "..");

loadEnv(path.join(projectDirectory, ".env"));

export function createConfig(env = process.env) {
  const authorizedParties = parseOrigins(env.CLERK_AUTHORIZED_PARTIES);
  return {
    port: numberFromEnv(env.PORT, 8787),
    apiKey: env.XAI_API_KEY || "",
    model: env.XAI_MODEL || "grok-4.5",
    timeoutMs: numberFromEnv(env.XAI_TIMEOUT_MS, 180000),
    maxRequestBytes: numberFromEnv(env.MAX_REQUEST_MB, 15) * 1024 * 1024,
    mockMode: booleanFromEnv(env.MOCK_XAI, false),
    managementApiKey: env.XAI_MANAGEMENT_API_KEY || "",
    teamId: env.XAI_TEAM_ID || "",
    outputUsdPerMillionTokens: env.XAI_OUTPUT_USD_PER_MILLION_TOKENS || "",
    clerkSecretKey: env.CLERK_SECRET_KEY || "",
    clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY || "",
    clerkJwtKey: env.CLERK_JWT_KEY || "",
    authorizedParties,
    allowedOrigins: new Set(authorizedParties),
    rateLimitWindowMs: numberFromEnv(env.RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMaxRequests: numberFromEnv(env.RATE_LIMIT_MAX_REQUESTS, 20),
    rateLimitMaxConcurrent: numberFromEnv(env.RATE_LIMIT_MAX_CONCURRENT, 2),
  };
}

export function createSnapGrokServer({
  config,
  authenticate,
  analyze = analyzeScreenshot,
  getBalance = getPrepaidBalance,
  rateLimiter = new UserRateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMaxRequests,
    maxConcurrent: config.rateLimitMaxConcurrent,
  }),
}) {
  return http.createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    response.setHeader("X-Request-Id", requestId);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, config)) {
        sendJson(request, response, config, 403, {
          ok: false,
          error: "Origin not allowed.",
          code: "ORIGIN_NOT_ALLOWED",
        });
        return;
      }
      setCommonHeaders(request, response, config);
      response.setHeader("Access-Control-Max-Age", "600");
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`,
    );

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(request, response, config, 200, {
          ok: true,
          version: "4.1.0",
          service: "snapgrok-api",
          authRequired: true,
          persistentRequestStorage: false,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/balance") {
        await authenticate(request);
        const balance = await getBalance({
          managementApiKey: config.managementApiKey,
          teamId: config.teamId,
          outputUsdPerMillionTokens: config.outputUsdPerMillionTokens,
        });
        sendJson(request, response, config, 200, balance);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/analyze") {
        requireAllowedOrigin(request, config);
        requireJsonContentType(request);
        rejectOversizedContentLength(request, config.maxRequestBytes);

        const identity = await authenticate(request);
        const releaseRateLimit = rateLimiter.acquire(identity.userId);
        const clientRequest = trackClientRequest(request, response);
        let body = null;

        try {
          body = await readJsonBody(request, config.maxRequestBytes);
          validateAnalyzeRequest(body);

          if (clientRequest.signal.aborted) return;

          const result = await analyze({
            apiKey: config.apiKey,
            model: config.model,
            timeoutMs: config.timeoutMs,
            imageDataUrl: body.imageDataUrl,
            instruction: body.instruction.trim(),
            shortcutName: String(body.shortcutName || "").trim(),
            mockMode: config.mockMode,
            signal: clientRequest.signal,
          });

          if (clientRequest.signal.aborted || response.destroyed) return;

          sendJson(request, response, config, 200, {
            ok: true,
            ...result,
          });
        } finally {
          clientRequest.cleanup();
          releaseRateLimit();
          clearSensitiveBody(body);
          body = null;
        }
        return;
      }

      sendJson(request, response, config, 404, {
        ok: false,
        error: "Not found.",
        code: "NOT_FOUND",
      });
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;

      const status = safeStatus(error?.status);
      const code = publicErrorCode(error, status);

      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        method: request.method,
        path: url.pathname,
        status,
        code,
        errorName: String(error?.name || "Error").slice(0, 80),
      }));

      if (error?.retryAfterSeconds) {
        response.setHeader("Retry-After", String(error.retryAfterSeconds));
      }

      sendJson(request, response, config, status, {
        ok: false,
        error: publicErrorMessage(error, status),
        code,
        requestId,
      });
    }
  });
}

function trackClientRequest(request, response) {
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded && !controller.signal.aborted) {
      controller.abort(new DOMException("The client disconnected.", "AbortError"));
    }
  };

  request.once("aborted", abort);
  response.once("close", abort);

  return {
    signal: controller.signal,
    cleanup() {
      request.off("aborted", abort);
      response.off("close", abort);
    },
  };
}

function setCommonHeaders(request, response, config) {
  const origin = request.headers.origin || "";
  if (origin && config.allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

function sendJson(request, response, config, status, body) {
  setCommonHeaders(request, response, config);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request, maxRequestBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxRequestBytes) {
      throw httpError(
        413,
        `Request exceeds ${Math.round(maxRequestBytes / 1024 / 1024)} MB.`,
        "REQUEST_TOO_LARGE",
      );
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "Request body must be valid JSON.", "INVALID_JSON");
  }
}

function validateAnalyzeRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "Request body must be a JSON object.", "INVALID_REQUEST");
  }

  if (
    typeof body.imageDataUrl !== "string" ||
    !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(
      body.imageDataUrl,
    )
  ) {
    throw httpError(
      400,
      "imageDataUrl must be a base64 JPEG, PNG, or WebP data URL.",
      "INVALID_IMAGE",
    );
  }

  if (typeof body.instruction !== "string" || !body.instruction.trim()) {
    throw httpError(400, "instruction is required.", "INVALID_INSTRUCTION");
  }
  if (body.instruction.length > 20000) {
    throw httpError(
      400,
      "instruction must not exceed 20,000 characters.",
      "INVALID_INSTRUCTION",
    );
  }
  if (body.shortcutName != null && String(body.shortcutName).length > 100) {
    throw httpError(
      400,
      "shortcutName must not exceed 100 characters.",
      "INVALID_REQUEST",
    );
  }
}

function requireJsonContentType(request) {
  const contentType = String(request.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw httpError(
      415,
      "Content-Type must be application/json.",
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }
}

function rejectOversizedContentLength(request, maxRequestBytes) {
  const length = Number(request.headers["content-length"]);
  if (Number.isFinite(length) && length > maxRequestBytes) {
    throw httpError(
      413,
      `Request exceeds ${Math.round(maxRequestBytes / 1024 / 1024)} MB.`,
      "REQUEST_TOO_LARGE",
    );
  }
}

function requireAllowedOrigin(request, config) {
  if (!isAllowedOrigin(request, config)) {
    throw httpError(403, "Origin not allowed.", "ORIGIN_NOT_ALLOWED");
  }
}

function isAllowedOrigin(request, config) {
  const origin = String(request.headers.origin || "");
  return Boolean(origin && config.allowedOrigins.has(origin));
}

function clearSensitiveBody(body) {
  if (!body || typeof body !== "object") return;
  body.imageDataUrl = "";
  body.instruction = "";
  body.shortcutName = "";
  body.sourceUrl = "";
  body.sourceTitle = "";
}

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : 500;
}

function publicErrorCode(error, status) {
  if (typeof error?.code === "string" && /^[A-Z0-9_]{2,64}$/.test(error.code)) {
    return error.code;
  }
  if (status === 401) return "AUTH_REQUIRED";
  return status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED";
}

function publicErrorMessage(error, status) {
  if (status >= 500) return "Internal server error.";
  return typeof error?.message === "string" && error.message
    ? error.message
    : "Request failed.";
}

function parseOrigins(value) {
  const origins = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) continue;

    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid origin in CLERK_AUTHORIZED_PARTIES: ${origin}`);
    }

    if (parsed.origin !== origin || !["https:", "http:"].includes(parsed.protocol)) {
      throw new Error(`CLERK_AUTHORIZED_PARTIES must contain origins only: ${origin}`);
    }
    if (parsed.protocol === "http:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      throw new Error(`Insecure non-local origin is not allowed: ${origin}`);
    }
  }

  return [...new Set(origins)];
}

function numberFromEnv(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanFromEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

const config = createConfig();

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const authenticate = createAuthenticator({
    secretKey: config.clerkSecretKey,
    publishableKey: config.clerkPublishableKey,
    jwtKey: config.clerkJwtKey,
    authorizedParties: config.authorizedParties,
  });
  const server = createSnapGrokServer({ config, authenticate });

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`SnapGrok API v4 is listening on port ${config.port}`);
    console.log("Clerk authentication: required");
    console.log("Persistent request storage: disabled");
  });
}
