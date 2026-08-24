import { monitorEventLoopDelay } from "node:perf_hooks";
import { createConfig, createZenaianServer } from "../src/server.js";

const EXTENSION_ORIGIN = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const options = parseOptions(process.argv.slice(2));
const memorySamples = [];
const eventLoop = monitorEventLoopDelay({ resolution: 10 });
const NativeResponse = Response;
globalThis.fetch = createXaiFetchStub(options.analysisMs);
const server = createProbeServer(options);

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
if (global.gc) global.gc();
const baselineMemory = process.memoryUsage();
eventLoop.enable();
const sampler = setInterval(() => memorySamples.push(process.memoryUsage()), 10);
sampler.unref();

const address = server.address();
process.send?.({ type: "ready", baseUrl: `http://127.0.0.1:${address.port}` });
process.once("message", async (message) => {
  if (message?.type !== "report") return;
  clearInterval(sampler);
  memorySamples.push(process.memoryUsage());
  eventLoop.disable();
  const peak = peakMemory([baselineMemory, ...memorySamples]);
  process.send?.({
    type: "report",
    metrics: {
      baselineRssMb: megabytes(baselineMemory.rss),
      peakRssMb: megabytes(peak.rss),
      rssIncreaseMb: megabytes(peak.rss - baselineMemory.rss),
      peakHeapUsedMb: megabytes(peak.heapUsed),
      peakExternalMb: megabytes(peak.external),
      eventLoopDelayMs: {
        mean: nanosecondsToMilliseconds(eventLoop.mean),
        p95: nanosecondsToMilliseconds(eventLoop.percentile(95)),
        p99: nanosecondsToMilliseconds(eventLoop.percentile(99)),
        max: nanosecondsToMilliseconds(eventLoop.max),
      },
      capacity: server.capacitySnapshot?.() || null,
    },
  });
  await new Promise((resolve) => server.close(resolve));
  process.disconnect?.();
});

function createProbeServer({ analysisMs, maxActive }) {
  const config = createConfig({
    ALLOWED_ORIGINS: EXTENSION_ORIGIN,
    CLERK_AUTHORIZED_PARTIES: EXTENSION_ORIGIN,
    XAI_API_KEY: "capacity-probe-key",
    MOCK_XAI: "false",
    RATE_LIMIT_MAX_REQUESTS: "10000",
    GLOBAL_RATE_LIMIT_MAX_REQUESTS: "100000",
    MAX_CONCURRENT_REQUESTS_PER_USER: "1",
    MAX_CONCURRENT_REQUESTS_GLOBAL: String(maxActive),
    ANALYSIS_POLL_INTERVAL_MS: "500",
    PERFORMANCE_LOGS_ENABLED: "false",
  });
  const deviceSessions = {
    async initialize() {},
    async close() {},
    async maintenance() {},
    async authenticateAccess(request) {
      const index = String(request.headers["x-probe-user"] || "0");
      return {
        userId: `user_capacity_probe_${index}`,
        sessionId: `session_capacity_probe_${index}`,
        deviceSessionId: `device_capacity_probe_${index}`,
        organizationId: null,
      };
    },
  };
  const privacy = {
    async initialize() {},
    async close() {},
    async assertUserAllowed() {},
    async assertAnalysisAllowed() {},
    async recordZdrSuccess() {},
  };

  return createZenaianServer({
    config,
    deviceSessions,
    privacy,
    authenticate: async () => ({
      userId: "user_capacity_probe_website",
      sessionId: "session_capacity_probe_website",
      organizationId: null,
    }),
  });
}

function createXaiFetchStub(analysisMs) {
  return async (url, init = {}) => {
    if (String(url) !== "https://api.x.ai/v1/responses") {
      throw new Error("The capacity probe attempted an unexpected outbound request.");
    }
    await abortableDelay(analysisMs, init.signal);
    await consumeBody(init.body, init.signal);
    return new NativeResponse(JSON.stringify({
      id: "capacity-probe-response",
      model: "capacity-probe",
      usage: null,
      output: [{
        content: [{
          type: "output_text",
          text: '{"status":"answered","answers":["A"]}',
        }],
      }],
    }), {
      status: 200,
      headers: { "x-zero-data-retention": "true" },
    });
  };
}

async function consumeBody(body, signal) {
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    return Buffer.byteLength(body);
  }
  let total = 0;
  for await (const chunk of body || []) {
    if (signal?.aborted) throw signal.reason;
    total += Buffer.byteLength(chunk);
  }
  return total;
}

function parseOptions(argumentsList) {
  const values = Object.fromEntries(
    argumentsList.map((argument) => {
      const [name, value = ""] = argument.replace(/^--/, "").split("=", 2);
      return [name, value];
    }),
  );
  return {
    maxActive: integerOption(values["max-active"], 20, 1, 200),
    analysisMs: integerOption(values["analysis-ms"], 1000, 10, 30000),
  };
}

function integerOption(value, fallback, minimum, maximum) {
  const number = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return number;
}

function peakMemory(samples) {
  return samples.reduce((peak, sample) => ({
    rss: Math.max(peak.rss, sample.rss),
    heapUsed: Math.max(peak.heapUsed, sample.heapUsed),
    external: Math.max(peak.external, sample.external),
  }), { rss: 0, heapUsed: 0, external: 0 });
}

function abortableDelay(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason || new DOMException("Aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function megabytes(bytes) {
  return rounded(bytes / 1024 / 1024);
}

function nanosecondsToMilliseconds(nanoseconds) {
  return rounded(Number(nanoseconds) / 1e6);
}

function rounded(number) {
  return Math.round(Number(number) * 100) / 100;
}
