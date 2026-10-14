import http from "k6/http";
import exec from "k6/execution";
import { sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Rate, Counter } from "k6/metrics";
import crypto from "k6/crypto";

// Account files contain only dedicated, disposable device credentials. Never
// commit them or a customer screenshot. Live runs also require the server's
// durable CANARY_* start budget to be enabled for these exact user IDs.
const accounts = new SharedArray("accounts", () => JSON.parse(open(__ENV.ACCOUNT_FILE)));
const fixture = open(__ENV.IMAGE_FILE);
const base = __ENV.BASE_URL || "http://127.0.0.1:8787";
const vus = Number(__ENV.ANALYSIS_VUS || 25);
const offset = Number(__ENV.ACCOUNT_OFFSET || 0);
const iterations = Number(__ENV.ANALYSIS_ITERATIONS || 4);
const controlIndex = Number(__ENV.CONTROL_INDEX || offset + vus);
const admission = new Trend("analysis_admission_ms", true);
const submission = new Trend("analysis_submission_ms", true);
const upload = new Trend("analysis_upload_ms", true);
const completion = new Trend("analysis_completion_ms", true);
const control = new Trend("account_control_ms", true);
const rejected = new Trend("rejected_analysis_ms", true);
const errors = new Rate("unexpected_errors");
const started = new Counter("analysis_jobs_started");
const completed = new Counter("analysis_jobs_completed");
let rejectionSequence = 0;

export const options = {
  batchPerHost: vus,
  scenarios: {
    analysis: { executor: "per-vu-iterations", vus, iterations, maxDuration: "3m", exec: "analysis", gracefulStop: "10s" },
  },
  thresholds: {
    unexpected_errors: [{ threshold: "rate==0", abortOnFail: true }],
    account_control_ms: [{ threshold: "p(95)<1500", abortOnFail: true, delayAbortEval: "15s" }],
    analysis_admission_ms: [{ threshold: "p(95)<2000", abortOnFail: true, delayAbortEval: "15s" }],
    analysis_completion_ms: [{ threshold: "p(95)<90000", abortOnFail: true, delayAbortEval: "30s" }],
    rejected_analysis_ms: [{ threshold: "p(95)<1500", abortOnFail: true, delayAbortEval: "15s" }],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(95)", "p(99)"],
};

function headers(a) {
  return { Origin: a.origin, Authorization: `Bearer ${a.accessToken}`, "Content-Type": "application/json" };
}
function json(r) { try { return r.json(); } catch { return {}; } }
function requireStatus(r, statuses, label) {
  const bad = !statuses.includes(r.status);
  errors.add(bad);
  if (bad) exec.test.abort(`${label}: HTTP ${r.status}, code ${json(r).code || "unknown"}`);
}

export function setup() {
  if (vus < 1 || vus > 30 || iterations < 1 || iterations > 5 || offset + vus > accounts.length) {
    throw new Error("Invalid canary bounds");
  }
  const chosen = [...accounts.slice(offset, offset + vus), accounts[controlIndex]];
  if (chosen.some(a => !a)) throw new Error("Missing control account");
  const refreshed = chosen.map(a => {
    if (__ENV.MOCK_LOAD === "true") return a;
    const r = http.post(`${base}/api/extension/session/refresh`, JSON.stringify({ refreshToken: a.refreshToken }), {
      headers: { Origin: a.origin, "Content-Type": "application/json" }, timeout: "15s",
    });
    requireStatus(r, [200], "refresh");
    return { ...a, ...json(r) };
  });
  const health = http.get(`${base}/api/health`, { timeout: "5s" });
  requireStatus(health, [200], "initial health");
  if (__ENV.WARM_CONTROL === "true") {
    // Report warm-up separately: it must not hide a cold-burst failure in the
    // measured canary or be advertised as evidence for cold-start latency.
    const warm = http.batch(refreshed.slice(0, vus).map(a => ["GET",
      `${base}/api/extension/account/status`, null,
      { headers: headers(a), timeout: "10s", tags: { path: "account_warmup" } },
    ]));
    for (const response of warm) requireStatus(response, [200], "warm account status");
    console.info(`Account warm-up: ${warm.length} requests, maximum ${Math.round(Math.max(...warm.map(r => r.timings.duration)))} ms`);
  }
  return refreshed;
}

export function analysis(data) {
  const a = data[exec.vu.idInTest - 1];
  if (!a) exec.test.abort("VU account mapping failed");
  runAnalysis(a, data[data.length - 1]);
  if (__ENV.EXTRA_QUOTA_CHECK === "true" && exec.vu.idInTest === 1 && exec.vu.iterationInScenario === iterations - 1) {
    runAnalysis(a, data[data.length - 1]);
    const q = http.post(`${base}/api/analyze-jobs`, JSON.stringify({ imageDataUrl: "invalid", padding: "x".repeat(65536) }), { headers: headers(a), timeout: "5s" });
    requireStatus(q, [429], "exhausted quota rejection");
    if (json(q).code !== "QUOTA_EXHAUSTED") exec.test.abort("Expected quota preflight rejection");
  }
}

function runAnalysis(a, controlAccount) {
  const startedAt = Date.now();
  const random = crypto.randomBytes(16);
  const hex = Array.from(new Uint8Array(random)).map(v => v.toString(16).padStart(2, "0")).join("");
  const operationId = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
  const r = http.post(`${base}/api/analyze-jobs`, JSON.stringify({
    operationId, imageDataUrl: fixture.trim(), instruction: "Answer the displayed practice question.", shortcutName: "capture-full-screen",
  }), { headers: headers(a), timeout: "15s", tags: { path: "analysis_submit" } });
  // A remote screenshot upload is not a backend-only latency measurement.
  // Keep transport time visible and guard time to acknowledgement separately;
  // server analysis_performance logs remain authoritative for backend timings.
  submission.add(r.timings.duration);
  upload.add(r.timings.sending);
  admission.add(r.timings.waiting);
  requireStatus(r, [202], "analysis admission");
  started.add(1);
  const jobId = json(r).jobId;
  let result;
  do {
    const batch = http.batch([
      ["POST", `${base}/api/analyze-jobs/${jobId}/poll`, "{}", { headers: headers(a), timeout: "10s", tags: { path: "analysis_poll" } }],
      ["GET", `${base}/api/extension/account/status`, null, { headers: headers(controlAccount), timeout: "5s", tags: { path: "account_status" } }],
      ["GET", `${base}/api/health`, null, { timeout: "5s", tags: { path: "health" } }],
    ]);
    result = batch[0];
    control.add(batch[1].timings.duration);
    requireStatus(batch[1], [200], "account status");
    requireStatus(batch[2], [200], "aggregate health");
    if (exec.vu.idInTest === 1) invalid([controlAccount]);
    requireStatus(result, [200, 202], "analysis poll");
    if (Date.now() - startedAt > 90000) {
      http.post(`${base}/api/analyze-jobs/${jobId}/cancel`, "{}", { headers: headers(a), timeout: "5s" });
      exec.test.abort("Analysis exceeded the 90-second canary deadline");
    }
    if (result.status === 202) sleep(0.1);
  } while (result.status === 202);
  completion.add(Date.now() - startedAt);
  completed.add(1);
}

export function account(data) {
  const a = data[data.length - 1];
  const r = http.get(`${base}/api/extension/account/status`, { headers: headers(a), timeout: "5s", tags: { path: "account_status" } });
  control.add(r.timings.duration);
  requireStatus(r, [200], "account status");
  const health = http.get(`${base}/api/health`, { timeout: "5s", tags: { path: "health" } });
  requireStatus(health, [200], "aggregate health");
}

export function invalid(data) {
  const anonymous = rejectionSequence++ % 2 === 0;
  const a = data[data.length - 1];
  const r = http.post(`${base}/api/analyze-jobs`, JSON.stringify({ imageDataUrl: "invalid", padding: "x".repeat(65536) }), {
    headers: anonymous ? { Origin: a.origin, "Content-Type": "application/json" } : headers(a), timeout: "5s", tags: { path: anonymous ? "anonymous_rejection" : "invalid_image_rejection" },
  });
  rejected.add(r.timings.duration);
  requireStatus(r, anonymous ? [401] : [400, 429], "invalid rejection");
}

export function teardown(data) {
  if (__ENV.MOCK_LOAD === "true") return;
  // Revocation also cancels this run's unfinished jobs if a threshold aborted.
  for (const a of data || []) {
    const r = http.post(`${base}/api/extension/session/revoke`, "{}", { headers: headers(a), timeout: "10s" });
    if (r.status !== 200) console.warn(`Test-session revocation returned HTTP ${r.status}; administrative cleanup is still required.`);
  }
}
