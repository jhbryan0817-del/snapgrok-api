import { fork } from "node:child_process";

const EXTENSION_ORIGIN = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const options = parseOptions(process.argv.slice(2));
const requestBody = createRequestBody(options.bodyKb);
const requestBytes = Buffer.byteLength(requestBody);
const worker = fork(
  new URL("capacity-probe-worker.js", import.meta.url),
  [
    `--max-active=${options.maxActive}`,
    `--analysis-ms=${options.analysisMs}`,
  ],
  { stdio: ["inherit", "inherit", "inherit", "ipc"] },
);

const ready = await waitForWorkerMessage(worker, "ready");
const startedAt = performance.now();
const outcomes = await Promise.all(
  Array.from({ length: options.concurrency }, (_, index) =>
    submitAndPoll(ready.baseUrl, index, requestBody, options.pollMs),
  ),
);
const durationMs = performance.now() - startedAt;
worker.send({ type: "report" });
const processMetrics = await waitForWorkerMessage(worker, "report");
await waitForExit(worker);

const accepted = outcomes.filter((outcome) => outcome.accepted);
const completed = outcomes.filter((outcome) => outcome.completed);
const rejected = outcomes.filter((outcome) => outcome.status === 429);
const failed = outcomes.filter(
  (outcome) => !outcome.completed && outcome.status !== 429,
);

console.log(JSON.stringify({
  configuration: {
    concurrency: options.concurrency,
    maxActive: options.maxActive,
    analysisMs: options.analysisMs,
    pollMs: options.pollMs,
    requestBytes,
  },
  results: {
    accepted: accepted.length,
    completed: completed.length,
    rejectedAtCapacity: rejected.length,
    failed: failed.length,
    totalHttpRequests: outcomes.reduce(
      (total, outcome) => total + outcome.httpRequests,
      0,
    ),
    durationMs: rounded(durationMs),
    throughputPerSecond: rounded((completed.length * 1000) / durationMs),
    submissionLatencyMs: percentiles(
      outcomes.map((outcome) => outcome.submissionMs),
    ),
    completionLatencyMs: percentiles(
      completed.map((outcome) => outcome.totalMs),
    ),
  },
  serverProcess: processMetrics.metrics,
}, null, 2));

async function submitAndPoll(baseUrl, index, body, pollMs) {
  const startedAt = performance.now();
  let httpRequests = 1;
  try {
    const response = await fetch(`${baseUrl}/api/analyze-jobs`, {
      method: "POST",
      headers: requestHeaders(index),
      body,
    });
    const submissionMs = performance.now() - startedAt;
    const payload = await response.json().catch(() => ({}));
    if (response.status !== 202) {
      return {
        accepted: false,
        completed: false,
        status: response.status,
        code: payload.code || "UNKNOWN",
        submissionMs,
        totalMs: performance.now() - startedAt,
        httpRequests,
      };
    }

    while (true) {
      await delay(pollMs);
      httpRequests += 1;
      const poll = await fetch(
        `${baseUrl}/api/analyze-jobs/${encodeURIComponent(payload.jobId)}/poll`,
        { method: "POST", headers: requestHeaders(index), body: "{}" },
      );
      const pollPayload = await poll.json().catch(() => ({}));
      if (poll.status === 202) continue;
      return {
        accepted: true,
        completed: poll.ok && pollPayload.status === "answered",
        status: poll.status,
        code: pollPayload.code || null,
        submissionMs,
        totalMs: performance.now() - startedAt,
        httpRequests,
      };
    }
  } catch (error) {
    return {
      accepted: false,
      completed: false,
      status: 0,
      code: error?.code || error?.name || "REQUEST_FAILED",
      submissionMs: performance.now() - startedAt,
      totalMs: performance.now() - startedAt,
      httpRequests,
    };
  }
}

function requestHeaders(index) {
  return {
    Authorization: "Bearer capacity-probe",
    Origin: EXTENSION_ORIGIN,
    "Content-Type": "application/json",
    "X-Probe-User": String(index),
  };
}

function createRequestBody(bodyKb) {
  const requestedBytes = Math.max(4, Math.round(bodyKb * 1024 * 0.74));
  const image = Buffer.alloc(requestedBytes);
  image[0] = 0xff;
  image[1] = 0xd8;
  image[2] = 0xff;
  image[image.length - 2] = 0xff;
  image[image.length - 1] = 0xd9;
  return JSON.stringify({
    operationId: "11111111-1111-4111-8111-111111111111",
    imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
    instruction: "Capacity probe",
  });
}

function parseOptions(argumentsList) {
  const values = Object.fromEntries(
    argumentsList.map((argument) => {
      const [name, value = ""] = argument.replace(/^--/, "").split("=", 2);
      return [name, value];
    }),
  );
  return {
    concurrency: integerOption(values.concurrency, 20, 1, 200),
    maxActive: integerOption(values["max-active"], 20, 1, 200),
    analysisMs: integerOption(values["analysis-ms"], 1000, 10, 30000),
    pollMs: integerOption(values["poll-ms"], 500, 100, 5000),
    bodyKb: integerOption(values["body-kb"], 512, 1, 14000),
  };
}

function integerOption(value, fallback, minimum, maximum) {
  const number = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return number;
}

function waitForWorkerMessage(child, type) {
  return new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message?.type !== type) return;
      cleanup();
      resolve(message);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Capacity probe server exited early with code ${code}.`));
    };
    const cleanup = () => {
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Capacity probe server exited with code ${code}.`));
    });
  });
}

function percentiles(values) {
  if (!values.length) return { p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const at = (percentile) => sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)
  ];
  return {
    p50: rounded(at(0.5)),
    p95: rounded(at(0.95)),
    p99: rounded(at(0.99)),
    max: rounded(sorted.at(-1)),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function rounded(number) {
  return Math.round(Number(number) * 100) / 100;
}
