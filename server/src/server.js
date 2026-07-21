import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { verifyToken } from "@clerk/backend";
import { loadEnv, envBoolean, envNumber } from "./env.js";
import { analyzeScreenshot, getPrepaidBalance } from "./xai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDirectory = path.resolve(__dirname, "..");

loadEnv(path.join(projectDirectory, ".env"));

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function normalizePem(value) {
  return String(value || "").trim().replace(/\\n/g, "\n");
}

function positiveInteger(name, fallback, minimum = 1) {
  const value = Math.floor(envNumber(name, fallback));
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

const allowedOrigins = new Set(parseCsv(process.env.ALLOWED_ORIGINS));
const configuredAuthorizedParties = parseCsv(
  process.env.CLERK_AUTHORIZED_PARTIES,
);
const clerkAuthorizedParties = configuredAuthorizedParties.length
  ? configuredAuthorizedParties
  : [...allowedOrigins];

const config = {
  port: positiveInteger("PORT", 8787),
  apiKey: process.env.XAI_API_KEY || "",
  model: process.env.XAI_MODEL || "grok-4.5",
  timeoutMs: positiveInteger("XAI_TIMEOUT_MS", 180000, 1000),
  maxRequestBytes:
    positiveInteger("MAX_REQUEST_MB", 15) * 1024 * 1024,
  mockMode: envBoolean("MOCK_XAI", false),

  clerkJwtKey: normalizePem(process.env.CLERK_JWT_KEY),
  clerkSecretKey: String(process.env.CLERK_SECRET_KEY || "").trim(),
  clerkAuthorizedParties,

  allowedOrigins,
  requireOrigin: envBoolean("REQUIRE_ALLOWED_ORIGIN", true),

  adminUserIds: new Set(parseCsv(process.env.ADMIN_USER_IDS)),
  managementApiKey: process.env.XAI_MANAGEMENT_API_KEY || "",
  teamId: process.env.XAI_TEAM_ID || "",
  outputUsdPerMillionTokens:
    process.env.XAI_OUTPUT_USD_PER_MILLION_TOKENS || "",

  rateLimitWindowMs: positiveInteger("RATE_LIMIT_WINDOW_MS", 60000, 1000),
  rateLimitMaxRequests: positiveInteger("RATE_LIMIT_MAX_REQUESTS", 10),
  maxConcurrentRequestsPerUser: positiveInteger(
    "MAX_CONCURRENT_REQUESTS_PER_USER",
    1,
  ),
  maxInstructionCharacters: positiveInteger(
    "MAX_INSTRUCTION_CHARACTERS",
    8000,
    100,
  ),
};

const rateLimitBuckets = new Map();
const activeRequestsByUser = new Map();

function httpError(status, message, code, extra = {}) {
  return Object.assign(new Error(message), {
    status,
    code,
    ...extra,
  });
}

function requestOrigin(request) {
  return String(request.headers.origin || "").trim().replace(/\/$/, "");
}

function isOriginAllowed(origin) {
  return Boolean(origin && config.allowedOrigins.has(origin));
}

function setCommonHeaders(request, response, requestId) {
  const origin = requestOrigin(request);

  if (isOriginAllowed(origin)) {
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

function sendJson(request, response, status, body, requestId, headers = {}) {
  setCommonHeaders(request, response, requestId);
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null && value !== "") {
      response.setHeader(name, String(value));
    }
  }
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function enforceOrigin(request) {
  const origin = requestOrigin(request);

  if (!origin) {
    if (config.requireOrigin) {
      throw httpError(403, "Request origin is missing.", "ORIGIN_REQUIRED");
    }
    return;
  }

  if (!isOriginAllowed(origin)) {
    throw httpError(403, "Request origin is not allowed.", "ORIGIN_NOT_ALLOWED");
  }
}

function extractBearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || "";
}

async function authenticateRequest(request) {
  if (!config.clerkJwtKey && !config.clerkSecretKey) {
    throw httpError(
      503,
      "Authentication is not configured on the server.",
      "AUTH_NOT_CONFIGURED",
    );
  }

  if (!config.clerkAuthorizedParties.length) {
    throw httpError(
      503,
      "Authorized Clerk parties are not configured on the server.",
      "AUTHORIZED_PARTIES_NOT_CONFIGURED",
    );
  }

  const token = extractBearerToken(request);
  if (!token) {
    throw httpError(401, "Sign in is required.", "AUTH_TOKEN_MISSING");
  }

  const verificationOptions = {
    authorizedParties: config.clerkAuthorizedParties,
  };

  if (config.clerkJwtKey) {
    verificationOptions.jwtKey = config.clerkJwtKey;
  } else {
    verificationOptions.secretKey = config.clerkSecretKey;
  }

  let claims;
  try {
    claims = await verifyToken(token, verificationOptions);
  } catch {
    throw httpError(
      401,
      "Your session is invalid or has expired. Sign in again.",
      "AUTH_TOKEN_INVALID",
    );
  }

  const userId = String(claims?.sub || "");
  const sessionId = String(claims?.sid || "");
  if (!userId || !sessionId) {
    throw httpError(
      401,
      "Your session is invalid or has expired. Sign in again.",
      "AUTH_CLAIMS_INVALID",
    );
  }

  return { userId, sessionId };
}

function consumeRateLimit(userId) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt: now + config.rateLimitWindowMs,
    };
    rateLimitBuckets.set(userId, bucket);
  }

  if (bucket.count >= config.rateLimitMaxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000),
    );
    throw httpError(
      429,
      "Too many analysis requests. Please try again shortly.",
      "RATE_LIMIT_EXCEEDED",
      { retryAfterSeconds },
    );
  }

  bucket.count += 1;
}

function beginUserRequest(userId) {
  const active = activeRequestsByUser.get(userId) || 0;
  if (active >= config.maxConcurrentRequestsPerUser) {
    throw httpError(
      429,
      "An analysis request is already running for this account.",
      "CONCURRENT_REQUEST_LIMIT",
      { retryAfterSeconds: 2 },
    );
  }
  activeRequestsByUser.set(userId, active + 1);
}

function endUserRequest(userId) {
  const active = activeRequestsByUser.get(userId) || 0;
  if (active <= 1) activeRequestsByUser.delete(userId);
  else activeRequestsByUser.set(userId, active - 1);
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw httpError(
      415,
      "Content-Type must be application/json.",
      "UNSUPPORTED_CONTENT_TYPE",
    );
  }

  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > config.maxRequestBytes) {
    throw httpError(
      413,
      `Request exceeds ${Math.round(config.maxRequestBytes / 1024 / 1024)} MB.`,
      "REQUEST_TOO_LARGE",
    );
  }

  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > config.maxRequestBytes) {
      throw httpError(
        413,
        `Request exceeds ${Math.round(config.maxRequestBytes / 1024 / 1024)} MB.`,
        "REQUEST_TOO_LARGE",
      );
    }
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
    throw httpError(
      400,
      "Request body must be a JSON object.",
      "INVALID_JSON",
    );
  }
}

function validateAnalyzeRequest(body) {
  if (
    typeof body.imageDataUrl !== "string" ||
    !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(
      body.imageDataUrl,
    )
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

  if (
    body.shortcutName !== undefined &&
    typeof body.shortcutName !== "string"
  ) {
    throw httpError(
      400,
      "shortcutName must be a string when provided.",
      "INVALID_SHORTCUT_NAME",
    );
  }
}

function publicErrorMessage(error) {
  const status = Number(error?.status) || 500;
  if (status >= 500 && status !== 503) {
    return "The analysis service is temporarily unavailable.";
  }
  return error?.message || "Internal server error.";
}

function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [userId, bucket] of rateLimitBuckets) {
    if (now >= bucket.resetAt) rateLimitBuckets.delete(userId);
  }
}

const cleanupTimer = setInterval(cleanupRateLimitBuckets, 5 * 60 * 1000);
cleanupTimer.unref();

const server = http.createServer(async (request, response) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`,
  );

  if (request.method === "OPTIONS") {
    try {
      enforceOrigin(request);
      setCommonHeaders(request, response, requestId);
      response.writeHead(204);
      response.end();
    } catch (error) {
      sendJson(
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
        request,
        response,
        200,
        {
          ok: true,
          version: "4.2.0-security",
          authRequired: true,
          persistentStorage: false,
        },
        requestId,
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/balance") {
      enforceOrigin(request);
      const auth = await authenticateRequest(request);

      if (!config.adminUserIds.has(auth.userId)) {
        throw httpError(404, "Not found.", "NOT_FOUND");
      }

      const balance = await getPrepaidBalance({
        managementApiKey: config.managementApiKey,
        teamId: config.teamId,
        outputUsdPerMillionTokens: config.outputUsdPerMillionTokens,
      });

      sendJson(request, response, 200, balance, requestId);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      enforceOrigin(request);
      const auth = await authenticateRequest(request);
      consumeRateLimit(auth.userId);
      beginUserRequest(auth.userId);

      let body = null;
      try {
        body = await readJsonBody(request);
        validateAnalyzeRequest(body);

        const result = await analyzeScreenshot({
          apiKey: config.apiKey,
          model: config.model,
          timeoutMs: config.timeoutMs,
          imageDataUrl: body.imageDataUrl,
          instruction: body.instruction.trim(),
          shortcutName: String(body.shortcutName || "").trim(),
          mockMode: config.mockMode,
        });

        sendJson(
          request,
          response,
          200,
          {
            ok: true,
            ...result,
          },
          requestId,
        );
      } finally {
        endUserRequest(auth.userId);
        if (body && typeof body === "object") {
          body.imageDataUrl = "";
          body.instruction = "";
          body.shortcutName = "";
          body.sourceUrl = "";
          body.sourceTitle = "";
        }
        body = null;
      }
      return;
    }

    throw httpError(404, "Not found.", "NOT_FOUND");
  } catch (error) {
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

server.listen(config.port, "0.0.0.0", () => {
  console.log(`SnapGrok server is listening on port ${config.port}`);
  console.log(`Model: ${config.mockMode ? "mock-xai" : config.model}`);
  console.log("Clerk authentication: required");
  console.log(`Allowed origins configured: ${config.allowedOrigins.size}`);
  console.log(
    `Per-user rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs} ms`,
  );
  console.log("Persistent request storage: disabled");
});
