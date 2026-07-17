importScripts("settings.js", "protocol.js");

"use strict";

const COMMAND_FULL = "capture-full-screen";
const COMMAND_ZONE = "capture-selected-zone";
const SERVER_URL = "https://snapgrok-api.onrender.com";
const RESULT_DISPLAY_MS = 5000;
const SELECTION_TTL_MS = 90000;
const PROCESSING_TTL_MS = 150000;
const FETCH_TIMEOUT_MS = 120000;
const OPERATION_KEY = "snapgrokOperation";
const INDICATOR_KEY = "snapgrokIndicatorState";

const BADGE_COLORS = {
  answered: "#27364a",
  inconclusive: "#f4b400",
  error: "#d93025",
};

const BADGE_TEXT_COLORS = {
  answered: "#ffffff",
  inconclusive: "#111111",
  error: "#ffffff",
};

const ICONS = {
  default: iconPath("default"),
  processing: iconPath("processing"),
};

let commandGate = false;
let resetTimerId = null;

chrome.commands.onCommand.addListener((command) => {
  if (command !== COMMAND_FULL && command !== COMMAND_ZONE) return;
  if (commandGate) return;

  commandGate = true;

  handleCommand(command)
    .catch((error) => showStandaloneSystemError(error))
    .finally(() => {
      commandGate = false;
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SNAPGROK_ZONE_SELECTED") {
    sendResponse({ accepted: true });
    void handleZoneSelected(message, sender).catch((error) => {
      void showSystemErrorForCurrentOperation(error);
    });
    return false;
  }

  if (message?.type === "SNAPGROK_ZONE_CANCELLED") {
    sendResponse({ accepted: true });
    void handleZoneCancelled(message, sender).catch((error) => {
      void showSystemErrorForCurrentOperation(error);
    });
    return false;
  }

  if (message?.type === "SNAPGROK_ZONE_ERROR") {
    sendResponse({ accepted: true });
    void handleZoneError(message, sender).catch((error) => {
      void showSystemErrorForCurrentOperation(error);
    });
    return false;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreRuntimeState();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void failSelectionIfTabDisappeared(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    void failSelectionIfTabDisappeared(tabId);
  }
});

void restoreRuntimeState();

function iconPath(baseName) {
  return {
    16: `icons/${baseName}16.png`,
    32: `icons/${baseName}32.png`,
    48: `icons/${baseName}48.png`,
    128: `icons/${baseName}128.png`,
  };
}

async function initializeExtension() {
  await SnapGrokSettings.getSettings();
  await setDefaultIndicator();
  await chrome.storage.session.remove([OPERATION_KEY, INDICATOR_KEY]);
}

async function handleCommand(command) {
  const occupied = await recoverAndCheckOccupied();
  if (occupied) return;

  const settings = await SnapGrokSettings.getSettings();
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const operation = await beginOperation(command, tab);

  try {
    if (!settings.instruction.trim()) {
      throw new Error("No instruction has been saved.");
    }

    if (!tab?.id || !Number.isInteger(tab.windowId)) {
      throw new Error("No active Chrome tab was found.");
    }

    if (command === COMMAND_FULL) {
      await updateOperation(operation.id, {
        phase: "processing",
        expiresAt: Date.now() + PROCESSING_TTL_MS,
      });

      await setProcessingIndicator(
        operation.id,
        "SnapGrok is capturing and analyzing the visible tab…",
      );

      const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 88,
      });

      await analyzeAndDisplay(
        operation.id,
        imageDataUrl,
        settings.instruction,
        "full visible tab",
      );
      return;
    }

    await clearBadge();
    await chrome.action.setIcon({ path: ICONS.default });
    await chrome.action.setTitle({
      title: "SnapGrok manual selection: drag over the question · Esc cancels",
    });

    await startZoneSelector(tab.id, operation.id);
  } catch (error) {
    await displaySystemError(operation.id, error);
  }
}

async function beginOperation(command, tab) {
  const now = Date.now();
  const isFull = command === COMMAND_FULL;

  const operation = {
    id: crypto.randomUUID(),
    mode: isFull ? "full" : "zone",
    phase: isFull ? "capturing" : "selecting",
    tabId: Number.isInteger(tab?.id) ? tab.id : null,
    windowId: Number.isInteger(tab?.windowId) ? tab.windowId : null,
    startedAt: now,
    expiresAt: now + (isFull ? PROCESSING_TTL_MS : SELECTION_TTL_MS),
  };

  await chrome.storage.session.set({ [OPERATION_KEY]: operation });
  return operation;
}

async function startZoneSelector(tabId, operationId) {
  const message = {
    type: "SNAPGROK_START_ZONE_SELECTOR",
    operationId,
  };

  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      throw new Error(response?.error || "The selector did not initialize.");
    }
  } catch (firstError) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["zone-selector.js"],
    });

    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      throw new Error(
        response?.error ||
          firstError?.message ||
          "The selector did not initialize.",
      );
    }
  }
}

async function handleZoneSelected(message, sender) {
  const operation = await getOperation();
  if (
    !operation ||
    operation.id !== message.operationId ||
    operation.phase !== "selecting"
  ) {
    return;
  }

  if (!sender.tab?.id || sender.tab.id !== operation.tabId) return;

  const rectangle = normalizeRectangle(message.rectangle, message.viewport);
  if (!rectangle) {
    await displaySystemError(
      operation.id,
      new Error("The selected area was invalid."),
    );
    return;
  }

  await updateOperation(operation.id, {
    phase: "processing",
    expiresAt: Date.now() + PROCESSING_TTL_MS,
  });

  try {
    const tab = await chrome.tabs.get(operation.tabId);
    if (!tab.active || tab.windowId !== operation.windowId) {
      throw new Error("The selected tab was no longer active.");
    }

    await setProcessingIndicator(
      operation.id,
      "SnapGrok is capturing and analyzing the selected area…",
    );

    const fullImageDataUrl = await chrome.tabs.captureVisibleTab(
      operation.windowId,
      {
        format: "jpeg",
        quality: 88,
      },
    );

    const croppedImageDataUrl = await cropScreenshot(
      fullImageDataUrl,
      rectangle,
    );

    const settings = await SnapGrokSettings.getSettings();
    if (!settings.instruction.trim()) {
      throw new Error("No instruction has been saved.");
    }

    await analyzeAndDisplay(
      operation.id,
      croppedImageDataUrl,
      settings.instruction,
      "manually selected area",
    );
  } catch (error) {
    await displaySystemError(operation.id, error);
  }
}

async function handleZoneCancelled(message, sender) {
  const operation = await getOperation();
  if (
    !operation ||
    operation.id !== message.operationId ||
    operation.phase !== "selecting"
  ) {
    return;
  }

  if (!sender.tab?.id || sender.tab.id !== operation.tabId) return;
  await clearOperationToDefault(operation.id);
}

async function handleZoneError(message, sender) {
  const operation = await getOperation();
  if (
    !operation ||
    operation.id !== message.operationId ||
    operation.phase !== "selecting"
  ) {
    return;
  }

  if (!sender.tab?.id || sender.tab.id !== operation.tabId) return;

  await displaySystemError(
    operation.id,
    new Error(
      typeof message.error === "string"
        ? message.error
        : "The selector failed.",
    ),
  );
}

async function analyzeAndDisplay(
  operationId,
  imageDataUrl,
  instruction,
  shortcutName,
) {
  const current = await getOperation();
  if (
    !current ||
    current.id !== operationId ||
    current.phase !== "processing"
  ) {
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${SERVER_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        imageDataUrl,
        instruction,
        shortcutName,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error || `Backend returned HTTP ${response.status}.`,
      );
    }

    const result = SnapGrokProtocol.parseServerPayload(payload);
    if (!result) {
      throw new Error(
        "The backend did not return a valid status and answers list.",
      );
    }

    if (result.status === "inconclusive") {
      await displayInconclusive(operationId);
      return;
    }

    await displayAnswers(operationId, result.answers);
  } catch (error) {
    const normalized =
      error?.name === "AbortError"
        ? new Error("The server request timed out.")
        : error;

    await displaySystemError(operationId, normalized);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function displayAnswers(operationId, answers) {
  const normalized = SnapGrokProtocol.normalizeResult({
    status: "answered",
    answers,
  });

  if (!normalized) {
    await displaySystemError(
      operationId,
      new Error("The answer list was empty or invalid."),
    );
    return;
  }

  const count = normalized.answers.length;
  const badgeText = SnapGrokProtocol.badgeForAnswers(normalized.answers);
  const title =
    count >= 2
      ? `SnapGrok answers: ${normalized.answers.join(", ")} · resets in 5 seconds`
      : `SnapGrok answer: ${normalized.answers[0]} · resets in 5 seconds`;

  await displayBadgeResult(operationId, {
    status: "answered",
    answers: normalized.answers,
    badgeText,
    title,
  });
}

async function displayInconclusive(operationId) {
  await displayBadgeResult(operationId, {
    status: "inconclusive",
    answers: [],
    badgeText: "?",
    title: "SnapGrok inconclusive · resets in 5 seconds",
  });
}

async function displaySystemError(operationId, error) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;

  const message = String(error?.message || "Unknown system error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  console.error(`[SnapGrok V3.7] ${message}`);

  await displayBadgeResult(operationId, {
    status: "error",
    answers: [],
    badgeText: "!",
    title: `SnapGrok system error: ${message} · resets in 5 seconds`,
  });
}

async function displayBadgeResult(
  operationId,
  { status, answers, badgeText, title },
) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;

  const resetAt = Date.now() + RESULT_DISPLAY_MS;
  const indicator = {
    operationId,
    status,
    answers,
    badgeText,
    badgeColor: BADGE_COLORS[status],
    badgeTextColor: BADGE_TEXT_COLORS[status],
    title,
    resetAt,
  };

  if (resetTimerId !== null) clearTimeout(resetTimerId);

  await applyBadgeIndicator(indicator);
  await chrome.storage.session.set({
    [INDICATOR_KEY]: indicator,
    [OPERATION_KEY]: {
      ...operation,
      phase: "result",
      expiresAt: resetAt,
    },
  });

  resetTimerId = setTimeout(() => {
    void resetResultIfCurrent(operationId);
  }, RESULT_DISPLAY_MS);
}

async function applyBadgeIndicator(indicator) {
  await chrome.action.setIcon({ path: ICONS.default });
  await chrome.action.setBadgeBackgroundColor({
    color: indicator.badgeColor,
  });

  if (typeof chrome.action.setBadgeTextColor === "function") {
    try {
      await chrome.action.setBadgeTextColor({
        color: indicator.badgeTextColor,
      });
    } catch {}
  }

  await chrome.action.setBadgeText({ text: indicator.badgeText });
  await chrome.action.setTitle({ title: indicator.title });
}

async function setProcessingIndicator(operationId, title) {
  const operation = await getOperation();
  if (
    !operation ||
    operation.id !== operationId ||
    operation.phase !== "processing"
  ) {
    return;
  }

  await clearBadge();
  await chrome.action.setIcon({ path: ICONS.processing });
  await chrome.action.setTitle({ title });
}

async function resetResultIfCurrent(operationId) {
  const stored = await chrome.storage.session.get([
    OPERATION_KEY,
    INDICATOR_KEY,
  ]);
  const operation = stored[OPERATION_KEY];
  const indicator = stored[INDICATOR_KEY];

  if (
    operation?.id !== operationId ||
    indicator?.operationId !== operationId
  ) {
    return;
  }

  if (resetTimerId !== null) {
    clearTimeout(resetTimerId);
    resetTimerId = null;
  }

  await setDefaultIndicator();
  await chrome.storage.session.remove([INDICATOR_KEY, OPERATION_KEY]);
}

async function clearOperationToDefault(operationId) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;

  await setDefaultIndicator();
  await chrome.storage.session.remove([INDICATOR_KEY, OPERATION_KEY]);
}

async function recoverAndCheckOccupied() {
  const stored = await chrome.storage.session.get([
    OPERATION_KEY,
    INDICATOR_KEY,
  ]);
  const operation = stored[OPERATION_KEY];
  const indicator = stored[INDICATOR_KEY];
  const now = Date.now();

  if (indicator?.operationId && operation?.id === indicator.operationId) {
    if (indicator.resetAt <= now) {
      await resetResultIfCurrent(operation.id);
      return false;
    }

    await applyBadgeIndicator(indicator);
    scheduleRemainingReset(operation.id, indicator.resetAt - now);
    return true;
  }

  if (!operation) return false;

  if (operation.expiresAt <= now) {
    await displaySystemError(
      operation.id,
      new Error("A previous operation expired before completion."),
    );
    return true;
  }

  if (operation.phase === "processing") {
    await clearBadge();
    await chrome.action.setIcon({ path: ICONS.processing });
    await chrome.action.setTitle({
      title: "SnapGrok is processing the captured screenshot…",
    });
    return true;
  }

  if (operation.phase === "selecting") {
    await clearBadge();
    await chrome.action.setIcon({ path: ICONS.default });
    await chrome.action.setTitle({
      title: "SnapGrok manual selection: drag over the question · Esc cancels",
    });
    return true;
  }

  return true;
}

async function restoreRuntimeState() {
  try {
    const stored = await chrome.storage.session.get([
      OPERATION_KEY,
      INDICATOR_KEY,
    ]);
    const operation = stored[OPERATION_KEY];
    const indicator = stored[INDICATOR_KEY];
    const now = Date.now();

    if (indicator?.operationId && operation?.id === indicator.operationId) {
      if (indicator.resetAt <= now) {
        await resetResultIfCurrent(operation.id);
        return;
      }

      await applyBadgeIndicator(indicator);
      scheduleRemainingReset(operation.id, indicator.resetAt - now);
      return;
    }

    if (operation?.phase === "processing" && operation.expiresAt > now) {
      await clearBadge();
      await chrome.action.setIcon({ path: ICONS.processing });
      await chrome.action.setTitle({
        title: "SnapGrok is processing the captured screenshot…",
      });
      return;
    }

    if (operation?.phase === "selecting" && operation.expiresAt > now) {
      await clearBadge();
      await chrome.action.setIcon({ path: ICONS.default });
      await chrome.action.setTitle({
        title: "SnapGrok manual selection: drag over the question · Esc cancels",
      });
      return;
    }

    if (operation?.expiresAt <= now) {
      await displaySystemError(
        operation.id,
        new Error("An interrupted operation was recovered."),
      );
      return;
    }

    if (!operation) await setDefaultIndicator();
  } catch (error) {
    console.error(error);
    await setDefaultIndicator();
    await chrome.storage.session.remove([OPERATION_KEY, INDICATOR_KEY]);
  }
}

function scheduleRemainingReset(operationId, milliseconds) {
  if (resetTimerId !== null) clearTimeout(resetTimerId);

  resetTimerId = setTimeout(() => {
    void resetResultIfCurrent(operationId);
  }, Math.max(0, milliseconds));
}

async function updateOperation(operationId, patch) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) {
    throw new Error("The active operation was no longer available.");
  }

  const updated = { ...operation, ...patch };
  await chrome.storage.session.set({ [OPERATION_KEY]: updated });
  return updated;
}

async function getOperation() {
  const stored = await chrome.storage.session.get(OPERATION_KEY);
  return stored[OPERATION_KEY] || null;
}

async function failSelectionIfTabDisappeared(tabId) {
  const operation = await getOperation();
  if (
    !operation ||
    operation.phase !== "selecting" ||
    operation.tabId !== tabId
  ) {
    return;
  }

  await displaySystemError(
    operation.id,
    new Error("The selected page was closed or navigated."),
  );
}

async function showSystemErrorForCurrentOperation(error) {
  const operation = await getOperation();
  if (operation) {
    await displaySystemError(operation.id, error);
    return;
  }

  await showStandaloneSystemError(error);
}

async function showStandaloneSystemError(error) {
  const now = Date.now();
  const operation = {
    id: crypto.randomUUID(),
    mode: "error",
    phase: "processing",
    tabId: null,
    windowId: null,
    startedAt: now,
    expiresAt: now + PROCESSING_TTL_MS,
  };

  await chrome.storage.session.set({ [OPERATION_KEY]: operation });
  await displaySystemError(operation.id, error);
}

async function clearBadge() {
  await chrome.action.setBadgeText({ text: "" });
}

async function setDefaultIndicator() {
  await clearBadge();
  await chrome.action.setIcon({ path: ICONS.default });
  await chrome.action.setTitle({ title: "Open SnapGrok settings" });
}

function normalizeRectangle(rectangle, viewport) {
  const x = Number(rectangle?.x);
  const y = Number(rectangle?.y);
  const width = Number(rectangle?.width);
  const height = Number(rectangle?.height);
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);

  if (
    ![x, y, width, height, viewportWidth, viewportHeight].every(
      Number.isFinite,
    )
  ) {
    return null;
  }

  if (
    width < 5 ||
    height < 5 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width,
    height,
    viewportWidth,
    viewportHeight,
  };
}

async function cropScreenshot(imageDataUrl, rectangle) {
  const sourceBlob = await (await fetch(imageDataUrl)).blob();
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const scaleX = bitmap.width / rectangle.viewportWidth;
    const scaleY = bitmap.height / rectangle.viewportHeight;
    const sx = clamp(
      Math.round(rectangle.x * scaleX),
      0,
      Math.max(0, bitmap.width - 1),
    );
    const sy = clamp(
      Math.round(rectangle.y * scaleY),
      0,
      Math.max(0, bitmap.height - 1),
    );
    const sw = clamp(
      Math.round(rectangle.width * scaleX),
      1,
      bitmap.width - sx,
    );
    const sh = clamp(
      Math.round(rectangle.height * scaleY),
      1,
      bitmap.height - sy,
    );

    const canvas = new OffscreenCanvas(sw, sh);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Chrome could not create the screenshot crop canvas.");
    }

    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    const croppedBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.9,
    });

    return blobToDataUrl(croppedBlob);
  } finally {
    bitmap.close();
  }
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

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
