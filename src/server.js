import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  outputUsdPerMillionTokens:
    process.env.XAI_OUTPUT_USD_PER_MILLION_TOKENS || "",
};

function setCommonHeaders(request, response) {
  const origin = request.headers.origin || "";
  const allowedOrigin =
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
      ? origin
      : "null";

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(request, response, status, body) {
  setCommonHeaders(request, response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > config.maxRequestBytes) {
      const error = new Error(
        `Request exceeds ${Math.round(config.maxRequestBytes / 1024 / 1024)} MB.`,
      );
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function validateAnalyzeRequest(body) {
  if (
    typeof body.imageDataUrl !== "string" ||
    !body.imageDataUrl.startsWith("data:image/")
  ) {
    throw Object.assign(new Error("imageDataUrl must be an image data URL."), {
      status: 400,
    });
  }

  if (typeof body.instruction !== "string" || !body.instruction.trim()) {
    throw Object.assign(new Error("instruction is required."), { status: 400 });
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    setCommonHeaders(request, response);
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
      sendJson(request, response, 200, {
        ok: true,
        version: "3.7.0",
        model: config.mockMode ? "mock-xai" : config.model,
        mockMode: config.mockMode,
        resultFormat: {
          status: "answered | inconclusive",
          answers: "array of option labels",
        },
        inferenceKeyConfigured: Boolean(
          config.apiKey && config.apiKey !== "paste_your_xai_api_key_here",
        ),
        balanceConfigured: Boolean(
          config.managementApiKey && config.teamId,
        ),
        persistentStorage: false,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/balance") {
      const balance = await getPrepaidBalance({
        managementApiKey: config.managementApiKey,
        teamId: config.teamId,
        outputUsdPerMillionTokens: config.outputUsdPerMillionTokens,
      });
      sendJson(request, response, 200, balance);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
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
  console.log("Structured multi-answer results: enabled");
  console.log("Persistent request storage: disabled");
});
