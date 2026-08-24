"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "image-optimization.js"),
  "utf8",
);

function loadOptimizationApi(overrides = {}) {
  const context = {
    Date,
    Math,
    Number,
    performance: { now: () => 1 },
    self: {},
    ...overrides,
  };
  vm.runInNewContext(SOURCE, context, { filename: "image-optimization.js" });
  return context.self.SnapGrokImageOptimization;
}

test("capture dimensions preserve aspect ratio and cap the long edge", () => {
  const api = loadOptimizationApi();

  assert.deepEqual(
    plain(api.calculateTargetDimensions(3840, 2160)),
    { width: 1920, height: 1080 },
  );
  assert.deepEqual(
    plain(api.calculateTargetDimensions(1080, 2400)),
    { width: 864, height: 1920 },
  );
  assert.deepEqual(
    plain(api.calculateTargetDimensions(1366, 768)),
    { width: 1366, height: 768 },
  );
});

test("base64 payload size is estimated without decoding screenshot content", () => {
  const api = loadOptimizationApi();

  assert.equal(api.estimateDataUrlBytes("data:image/jpeg;base64,/9j/2Q=="), 4);
  assert.equal(api.estimateDataUrlBytes("data:image/jpeg;base64,"), 0);
  assert.equal(api.estimateDataUrlBytes("not-a-data-url"), 0);
});

test("a large capture is decoded, resized once, and released", async () => {
  let closed = false;
  let canvasDimensions = null;
  let drawArguments = null;
  const api = loadOptimizationApi({
    fetch: async () => ({ blob: async () => ({ size: 3 }) }),
    createImageBitmap: async () => ({
      width: 3840,
      height: 2160,
      close: () => { closed = true; },
    }),
    OffscreenCanvas: class {
      constructor(width, height) {
        canvasDimensions = { width, height };
      }

      getContext() {
        return {
          drawImage: (...args) => { drawArguments = args; },
        };
      }

      async convertToBlob() {
        return {
          type: "image/jpeg",
          size: 4,
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      }
    },
    Uint8Array,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  });

  const result = await api.optimizeCapture("data:image/jpeg;base64,AAAA");

  assert.deepEqual(canvasDimensions, { width: 1920, height: 1080 });
  assert.equal(drawArguments.length, 9);
  assert.equal(result.stats.sourceWidth, 3840);
  assert.equal(result.stats.outputWidth, 1920);
  assert.equal(result.stats.outputBytes, 4);
  assert.equal(result.stats.optimized, true);
  assert.equal(result.stats.targetMet, true);
  assert.equal(result.stats.targetBytes, 512 * 1024);
  assert.equal(closed, true);
});

test("an oversized capture lowers encoding quality until it meets the byte target", async () => {
  const qualities = [];
  const outputTypes = [];
  const api = loadOptimizationApi({
    fetch: async () => ({ blob: async () => ({ size: 900000 }) }),
    createImageBitmap: async () => ({ width: 1600, height: 900, close() {} }),
    OffscreenCanvas: class {
      getContext() {
        return { drawImage() {} };
      }

      async convertToBlob({ quality, type }) {
        qualities.push(quality);
        outputTypes.push(type);
        const size = quality > 0.75 ? 700000 : 480000;
        return {
          type: "image/jpeg",
          size,
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      }
    },
    Uint8Array,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  });

  const result = await api.optimizeCapture(
    `data:image/jpeg;base64,${"A".repeat(800000)}`,
    {
    targetBytes: 500000,
    },
  );

  assert.deepEqual(qualities, [0.82, 0.74]);
  assert.deepEqual(outputTypes, ["image/webp", "image/webp"]);
  assert.equal(result.stats.outputBytes, 480000);
  assert.equal(result.stats.quality, 0.74);
  assert.equal(result.stats.targetMet, true);
});

test("service worker routes full and zone captures through the optimizer", () => {
  const worker = fs.readFileSync(
    path.join(__dirname, "..", "service-worker.js"),
    "utf8",
  );

  assert.match(worker, /"image-optimization\.js"/);
  assert.match(worker, /"retry-policy\.js"/);
  assert.match(worker, /const CAPTURE_JPEG_QUALITY = 82;/);
  assert.equal(
    (worker.match(/SnapGrokImageOptimization\.optimizeCapture\(/g) || []).length,
    2,
  );
  assert.match(worker, /trace\("CAPTURE_PREPARED"/);
  assert.doesNotMatch(worker, /console\.(?:debug|log|info)\([^\n]*(?:imageDataUrl|instruction)/);
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
