(() => {
  "use strict";

  const DEFAULT_MAX_LONG_EDGE = 1920;
  const DEFAULT_JPEG_QUALITY = 0.82;

  async function optimizeCapture(
    imageDataUrl,
    {
      crop = null,
      maxLongEdge = DEFAULT_MAX_LONG_EDGE,
      jpegQuality = DEFAULT_JPEG_QUALITY,
    } = {},
  ) {
    const startedAt = monotonicNow();
    const sourceBytes = estimateDataUrlBytes(imageDataUrl);
    const sourceBlob = await (await fetch(imageDataUrl)).blob();
    const bitmap = await createImageBitmap(sourceBlob);

    try {
      const source = crop
        ? sourceCropRectangle(bitmap, crop)
        : { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
      const target = calculateTargetDimensions(
        source.width,
        source.height,
        maxLongEdge,
      );
      const needsReencode = Boolean(crop) ||
        target.width !== source.width ||
        target.height !== source.height;

      if (!needsReencode) {
        return {
          imageDataUrl,
          stats: captureStats({
            sourceBytes,
            outputBytes: sourceBytes,
            sourceWidth: source.width,
            sourceHeight: source.height,
            outputWidth: source.width,
            outputHeight: source.height,
            optimized: false,
            startedAt,
          }),
        };
      }

      const canvas = new OffscreenCanvas(target.width, target.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("Chrome could not create the screenshot optimization canvas.");
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        bitmap,
        source.x,
        source.y,
        source.width,
        source.height,
        0,
        0,
        target.width,
        target.height,
      );

      const outputBlob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: boundedQuality(jpegQuality),
      });
      const outputDataUrl = await blobToDataUrl(outputBlob);
      return {
        imageDataUrl: outputDataUrl,
        stats: captureStats({
          sourceBytes,
          outputBytes: outputBlob.size,
          sourceWidth: source.width,
          sourceHeight: source.height,
          outputWidth: target.width,
          outputHeight: target.height,
          optimized: true,
          startedAt,
        }),
      };
    } finally {
      bitmap.close();
    }
  }

  function sourceCropRectangle(bitmap, rectangle) {
    const viewportWidth = positiveNumber(rectangle?.viewportWidth, "viewport width");
    const viewportHeight = positiveNumber(rectangle?.viewportHeight, "viewport height");
    const scaleX = bitmap.width / viewportWidth;
    const scaleY = bitmap.height / viewportHeight;
    const x = clamp(
      Math.round(positiveOrZero(rectangle?.x) * scaleX),
      0,
      Math.max(0, bitmap.width - 1),
    );
    const y = clamp(
      Math.round(positiveOrZero(rectangle?.y) * scaleY),
      0,
      Math.max(0, bitmap.height - 1),
    );
    const width = clamp(
      Math.round(positiveNumber(rectangle?.width, "crop width") * scaleX),
      1,
      bitmap.width - x,
    );
    const height = clamp(
      Math.round(positiveNumber(rectangle?.height, "crop height") * scaleY),
      1,
      bitmap.height - y,
    );
    return { x, y, width, height };
  }

  function calculateTargetDimensions(width, height, maxLongEdge = DEFAULT_MAX_LONG_EDGE) {
    const safeWidth = Math.max(1, Math.round(positiveNumber(width, "image width")));
    const safeHeight = Math.max(1, Math.round(positiveNumber(height, "image height")));
    const safeMaxLongEdge = Math.max(
      320,
      Math.round(positiveNumber(maxLongEdge, "maximum long edge")),
    );
    const longEdge = Math.max(safeWidth, safeHeight);
    if (longEdge <= safeMaxLongEdge) {
      return { width: safeWidth, height: safeHeight };
    }
    const scale = safeMaxLongEdge / longEdge;
    return {
      width: Math.max(1, Math.round(safeWidth * scale)),
      height: Math.max(1, Math.round(safeHeight * scale)),
    };
  }

  function estimateDataUrlBytes(value) {
    const text = String(value || "");
    const comma = text.indexOf(",");
    if (comma < 0) return 0;
    const encoded = text.slice(comma + 1);
    if (!encoded) return 0;
    const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
  }

  function captureStats({
    sourceBytes,
    outputBytes,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    optimized,
    startedAt,
  }) {
    return {
      sourceBytes: nonnegativeInteger(sourceBytes),
      outputBytes: nonnegativeInteger(outputBytes),
      sourceWidth: nonnegativeInteger(sourceWidth),
      sourceHeight: nonnegativeInteger(sourceHeight),
      outputWidth: nonnegativeInteger(outputWidth),
      outputHeight: nonnegativeInteger(outputHeight),
      optimized: optimized === true,
      durationMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
    };
  }

  async function blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
  }

  function boundedQuality(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? clamp(numeric, 0.6, 0.95) : DEFAULT_JPEG_QUALITY;
  }

  function positiveNumber(value, label) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(`Invalid ${label}.`);
    }
    return numeric;
  }

  function positiveOrZero(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }

  function nonnegativeInteger(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
  }

  function monotonicNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  self.SnapGrokImageOptimization = Object.freeze({
    DEFAULT_MAX_LONG_EDGE,
    DEFAULT_JPEG_QUALITY,
    calculateTargetDimensions,
    estimateDataUrlBytes,
    optimizeCapture,
  });
})();
