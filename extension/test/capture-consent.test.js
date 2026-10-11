"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const settingsSource = fs.readFileSync(path.join(root, "settings.js"), "utf8");
const workerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const commandSource = workerSource.slice(
  workerSource.indexOf("async function handleCommand(command)"),
  workerSource.indexOf("async function beginOperation(command, tab)"),
);

function settingsHarness() {
  const stored = {};
  const context = {
    self: {},
    chrome: { storage: { local: {
      async get(key) { return { [key]: stored[key] }; },
      async set(values) { Object.assign(stored, values); },
      async remove(key) { delete stored[key]; },
    } } },
  };
  vm.runInNewContext(settingsSource, context);
  return { settings: context.self.SnapGrokSettings, stored };
}

test("capture consent requires an explicit agreement to the current disclosure", async () => {
  const { settings, stored } = settingsHarness();
  assert.equal(await settings.hasCaptureConsent(), false);
  stored.zenaianCaptureConsent = { accepted: "true", disclosureVersion: 1 };
  assert.equal(await settings.hasCaptureConsent(), false);
  stored.zenaianCaptureConsent = { accepted: true, disclosureVersion: 0 };
  assert.equal(await settings.hasCaptureConsent(), false);
  await settings.setCaptureConsent(true);
  assert.equal(await settings.hasCaptureConsent(), true);
  assert.ok(Number.isFinite(Date.parse(stored.zenaianCaptureConsent.acceptedAt)));
  await settings.setCaptureConsent(false);
  assert.equal(await settings.hasCaptureConsent(), false);
});

function commandHarness(settings) {
  const calls = [];
  const context = {
    COMMAND_FULL: "capture-full-screen",
    COMMAND_ZONE: "capture-selected-zone",
    CAPTURE_JPEG_QUALITY: 82,
    PROCESSING_TTL_MS: 150000,
    Date,
    async recoverAndCheckOccupied() { return false; },
    SnapGrokAuth: { async getAccessToken() { return "synthetic-token"; } },
    SnapGrokSettings: {
      hasCaptureConsent: settings.hasCaptureConsent,
      async getSettings() { calls.push("settings"); return { instruction: "" }; },
    },
    chrome: {
      tabs: {
        async query() { calls.push("tab-query"); return [{ id: 1, windowId: 1 }]; },
        async captureVisibleTab() { calls.push("capture"); return "synthetic-image"; },
      },
      action: { async setTitle() {} },
    },
    SnapGrokImageOptimization: {
      async optimizeCapture(imageDataUrl) { return { imageDataUrl, stats: {} }; },
    },
    async beginOperation() { calls.push("operation"); return { id: "operation" }; },
    async updateOperation() {},
    async setProcessingIndicator() {},
    async analyzeAndDisplay() { calls.push("analysis"); },
    async startZoneSelector() { calls.push("selector"); },
    async displayOutcome(_id, _outcome, error) { throw error; },
    isBrowserRestrictedPage() { return false; },
    errorOutcome() { return {}; },
    trace() {},
    traceCapturePerformance() {},
    shortId(value) { return value; },
  };
  vm.runInNewContext(commandSource, context);
  return { calls, run: context.handleCommand };
}

test("both shortcuts stop before reading a tab or screenshot without consent", async () => {
  const { settings } = settingsHarness();
  for (const command of ["capture-full-screen", "capture-selected-zone"]) {
    const { calls, run } = commandHarness(settings);
    await assert.rejects(run(command), /agree to AI capture processing/);
    assert.deepEqual(calls, []);
  }
});

test("consent permits both capture paths and revocation blocks the next command", async () => {
  const { settings } = settingsHarness();
  await settings.setCaptureConsent(true);
  const full = commandHarness(settings);
  await full.run("capture-full-screen");
  assert.deepEqual(full.calls, ["settings", "tab-query", "operation", "capture", "analysis"]);
  const zone = commandHarness(settings);
  await zone.run("capture-selected-zone");
  assert.deepEqual(zone.calls, ["settings", "tab-query", "operation", "selector"]);
  await settings.setCaptureConsent(false);
  const revoked = commandHarness(settings);
  await assert.rejects(revoked.run("capture-full-screen"), /agree to AI capture processing/);
  assert.deepEqual(revoked.calls, []);
});
