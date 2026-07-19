import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyToken } from "@clerk/backend";
import { loadEnv, envBoolean, envNumber } from "./env.js";
import { analyzeScreenshot, getPrepaidBalance } from "./xai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDirectory = path.resolve(__dirname, "..");

loadEnv(path.join(projectDirectory, ".env"));

const config = {
  port: envNumber("PORT", 8787),
  apiKey: process.env.XAI_API_KEY || "",
  model: process.env.XAI_MODEL || "grok-4.5",
  timeoutMs: envNumber("XAI_TIMEOUT_MS", 180000),
  maxRequestBytes: envNumber("MAX_REQUEST_MB", 15) * 1024 * 1024,
  mockMode: envBoolean("MOCK_XAI", false),
  managementApiKey: process.env.XAI_MANAGEMENT_API_KEY || "",
  teamId: process.env.XAI_TEAM_ID || "",
  outputUsdPerMillionTokens: process.env.XAI_OUTPUT_USD_PER_MILLION_TOKENS || "",
  clerkSecretKey: process.env.CLERK_SECRET_KEY || "",
  clerkAuthorizedParties: String(process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean),
};

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (config.clerkAuthorizedParties.includes(origin.replace(/\/$/, ""))) return true;
  return origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
}

function setCommonHeaders(request, response) {
  const origin = String(request.headers.origin || "");

  if (origin && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(request, response, status, body) {
  setCommonHeaders(request, response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function createHttpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function requireClerkUser(request) {
  const origin = String(request.headers.origin || "");
  if (origin && !isAllowedOrigin(origin)) {
    throw createHttpError(403, "This request origin is not allowed.");
  }

  if (!config.clerkSecretKey || !config.clerkAuthorizedParties.length) {
    throw createHttpError(500, "Server authentication is not configured.");
  }

  const authorization = String(request.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw createHttpError(401, "Sign in is required.");
  }

  try {
    const claims = await verifyToken(match[1], {
      secretKey: config.clerkSecretKey,
      authorizedParties: config.clerkAuthorizedParties,
    });

    if (!claims?.sub) {
      throw new Error("The verified token did not contain a Clerk user ID.");
    }

    return {
      userId: claims.sub,
      sessionId: claims.sid || "",
    };
  } catch (error) {
    console.warn(
      `[${new Date().toISOString()}] Clerk token rejected: ${error?.message || "verification failed"}`,
    );
    throw createHttpError(401, "The session is invalid or expired.");
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > config.maxRequestBytes) {
      throw createHttpError(
        413,
        `Request exceeds ${Math.round(config.maxRequestBytes / 1024 / 1024)} MB.`,
      );
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError(400, "Request body must be valid JSON.");
  }
}

function validateAnalyzeRequest(body) {
  if (
    typeof body.imageDataUrl !== "string" ||
    !body.imageDataUrl.startsWith("data:image/")
  ) {
    throw createHttpError(400, "imageDataUrl must be an image data URL.");
  }

  if (typeof body.instruction !== "string" || !body.instruction.trim()) {
    throw createHttpError(400, "instruction is required.");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    setCommonHeaders(request, response);
    response.writeHead(isAllowedOrigin(String(request.headers.origin || "")) ? 204 : 403);
    response.end();
    return;
  }

  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`,
  );

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(request, response, 200, {
        ok: true,
        version: "4.0.0",
        model: config.mockMode ? "mock-xai" : config.model,
        mockMode: config.mockMode,
        authentication: "clerk",
        authenticationConfigured: Boolean(
          config.clerkSecretKey && config.clerkAuthorizedParties.length,
        ),
        persistentStorage: false,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      const authenticatedUser = await requireClerkUser(request);
      sendJson(request, response, 200, {
        ok: true,
        authenticated: true,
        userId: authenticatedUser.userId,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/balance") {
      await requireClerkUser(request);
      const balance = await getPrepaidBalance({
        managementApiKey: config.managementApiKey,
        teamId: config.teamId,
        outputUsdPerMillionTokens: config.outputUsdPerMillionTokens,
      });
      sendJson(request, response, 200, balance);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      // Verify the Clerk session before reading or processing the screenshot.
      await requireClerkUser(request);
      let body = await readJsonBody(request);

      try {
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

        sendJson(request, response, 200, {
          ok: true,
          ...result,
        });
      } finally {
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

    sendJson(request, response, 404, { ok: false, error: "Not found." });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] ${error?.name || "Error"}: ${error?.message || "Unknown error"}`,
    );

    sendJson(request, response, error.status || 500, {
      ok: false,
      error: error.message || "Internal server error.",
    });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`SnapGrok server is listening on port ${config.port}`);
  console.log(`Model: ${config.mockMode ? "mock-xai" : config.model}`);
  console.log(`Clerk authentication: ${config.clerkSecretKey ? "key configured" : "not configured"}`);
  console.log(`Authorized parties: ${config.clerkAuthorizedParties.length}`);
  console.log("Persistent request storage: disabled");
});
