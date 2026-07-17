importScripts("settings.js", "protocol.js");

"use strict";

const COMMAND_FULL = "capture-full-screen";
const COMMAND_ZONE = "capture-selected-zone";
const SERVER_URL = "https://snapgrok-api.onrender.com";
const MAX_WORDS = 20;
const RESULT_DISPLAY_MS = 5000;
const SELECTION_TTL_MS = 90000;
const PROCESSING_TTL_MS = 45000;
const FETCH_TIMEOUT_MS = 27000;
const OPERATION_KEY = "snapgrokOperation";
const ICON_STATE_KEY = "snapgrokIconState";

const ICONS = {
  default: iconPath("default"),
  PROCESSING: iconPath("processing"),
  A: iconPath("answer-a"),
  B: iconPath("answer-b"),
  C: iconPath("answer-c"),
  D: iconPath("answer-d"),
  E: iconPath("answer-e"),
  F: iconPath("inconclusive"),
  ERROR: iconPath("system-error"),
};

let commandGate = false;
let resetTimerId = null;

chrome.commands.onCommand.addListener((command) => {
  if (command !== COMMAND_FULL && command !== COMMAND_ZONE) return;
  if (commandGate) return;

  commandGate = true;
  trace("COMMAND_RECEIVED", { command });

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

function trace(eventName, details = {}) {
  console.debug(`[SnapGrok V3.5] ${eventName}`, details);
}

async function initializeExtension() {
  await SnapGrokSettings.getSettings();
  await setDefaultIcon();
  await chrome.storage.session.remove([OPERATION_KEY, ICON_STATE_KEY]);
}

async function handleCommand(command) {
  const occupied = await recoverAndCheckOccupied();
  if (occupied) {
    trace("COMMAND_IGNORED_BUSY", { command });
    return;
  }

  const settings = await SnapGrokSettings.getSettings();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const operation = await beginOperation(command, tab);

  try {
    if (!settings.instruction.trim()) {
      throw new Error("No instruction has been saved.");
    }

    if (!tab?.id || !Number.isInteger(tab.windowId)) {
      throw new Error("No active Chrome tab was found.");
    }

    if (command === COMMAND_FULL) {
      const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 88,
      });

      await updateOperation(operation.id, {
        phase: "processing",
        expiresAt: Date.now() + PROCESSING_TTL_MS,
      });
      await setProcessingIndicator(operation.id, "SnapGrok captured the visible tab and is analyzing it…");

      trace("FULL_CAPTURE_COMPLETED", { operationId: shortId(operation.id) });
      await analyzeAndDisplay(operation.id, imageDataUrl, settings.instruction);
      return;
    }

    await chrome.action.setTitle({ title: "SnapGrok: drag to select a screenshot area" });
    await startZoneSelector(tab.id, operation.id);
    trace("ZONE_SELECTOR_READY", { operationId: shortId(operation.id) });
  } catch (error) {
    await displayResult(operation.id, "ERROR", error);
  }
}

async function beginOperation(command, tab) {
  const now = Date.now();
  const operation = {
    id: crypto.randomUUID(),
    mode: command === COMMAND_FULL ? "full" : "zone",
    phase: command === COMMAND_FULL ? "capturing" : "selecting",
    tabId: Number.isInteger(tab?.id) ? tab.id : null,
    windowId: Number.isInteger(tab?.windowId) ? tab.windowId : null,
    startedAt: now,
    expiresAt: now + (command === COMMAND_FULL ? PROCESSING_TTL_MS : SELECTION_TTL_MS),
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
    if (!response?.ok) throw new Error(response?.error || "The selector did not initialize.");
    return;
  } catch (firstError) {
    trace("ZONE_LISTENER_FALLBACK_INJECTION", { operationId: shortId(operationId) });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["zone-selector.js"],
    });

    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      throw new Error(response?.error || firstError?.message || "The selector did not initialize.");
    }
  }
}

async function handleZoneSelected(message, sender) {
  const operation = await getOperation();
  if (!operation || operation.id !== message.operationId || operation.phase !== "selecting") return;
  if (!sender.tab?.id || sender.tab.id !== operation.tabId) return;

  const rectangle = normalizeRectangle(message.rectangle, message.viewport);
  if (!rectangle) {
    await displayResult(operation.id, "ERROR", new Error("The selected area was invalid."));
    return;
  }

  await updateOperation(operation.id, {
    phase: "processing",
    expiresAt: Date.now() + PROCESSING_TTL_MS,
  });

  try {
    const tab = await chrome.tabs.get(operation.tabId);
    if (!tab.active || tab.windowId !== operation.windowId) {
      throw new Error("The selected tab was no longer active when capture began.");
    }

    const fullImageDataUrl = await chrome.tabs.captureVisibleTab(operation.windowId, {
      format: "jpeg",
      quality: 88,
    });

    const croppedImageDataUrl = await cropScreenshot(fullImageDataUrl, rectangle);
    await setProcessingIndicator(operation.id, "SnapGrok captured the selected area and is analyzing it…");
    trace("ZONE_CAPTURE_COMPLETED", { operationId: shortId(operation.id) });

    const settings = await SnapGrokSettings.getSettings();
    if (!settings.instruction.trim()) throw new Error("No instruction has been saved.");

    await analyzeAndDisplay(operation.id, croppedImageDataUrl, settings.instruction);
  } catch (error) {
    await displayResult(operation.id, "ERROR", error);
  }
}

async function handleZoneCancelled(message, sender) {
  const operation = await getOperation();
  if (!operation || operation.id !== message.operationId || operation.phase !== "selecting") return;
  if (!sender.tab?.id || sender.tab.id !== operation.tabId) return;

  trace("ZONE_SELECTION_CANCELLED", { operationId: shortId(operation.id) });
  await clearOperationToDefault(operation.id);
}

async function handleZoneError(message, sender) {
  const operation = await getOperation();
  if (!operation || operation.id !== message.operationId || operation.phase !== "selecting") return;
  if (!sender.tab?.id || sender.tab.id !== operation.tabId) return;

  await displayResult(
    operation.id,
    "ERROR",
    new Error(typeof message.error === "string" ? message.error : "The selector failed."),
  );
}

async function analyzeAndDisplay(operationId, imageDataUrl, userInstruction) {
  const current = await getOperation();
  if (!current || current.id !== operationId || current.phase !== "processing") return;

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
        instruction: SnapGrokProtocol.buildInstruction(userInstruction),
        maxWords: MAX_WORDS,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Backend returned HTTP ${response.status}.`);
    }

    const choice = SnapGrokProtocol.parseChoice(payload.text);
    if (!choice) {
      throw new Error("The AI response did not contain one valid A-F result.");
    }

    trace("SERVER_RESULT_RECEIVED", { operationId: shortId(operationId) });
    await displayResult(operationId, choice);
  } catch (error) {
    const normalized = error?.name === "AbortError"
      ? new Error("The server request timed out.")
      : error;
    await displayResult(operationId, "ERROR", normalized);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function displayResult(operationId, kind, error = null) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;
  if (!ICONS[kind] || kind === "default" || kind === "PROCESSING") kind = "ERROR";

  if (error) {
    console.error(`[SnapGrok V3.5] ${error?.name || "Error"}: ${error?.message || "Unknown error"}`);
  }

  const resetAt = Date.now() + RESULT_DISPLAY_MS;
  const iconState = { operationId, kind, resetAt };

  if (resetTimerId !== null) clearTimeout(resetTimerId);

  await chrome.action.setIcon({ path: ICONS[kind] });
  await chrome.action.setTitle({ title: titleForResult(kind) });
  await chrome.storage.session.set({
    [ICON_STATE_KEY]: iconState,
    [OPERATION_KEY]: {
      ...operation,
      phase: "result",
      expiresAt: resetAt,
    },
  });

  trace("RESULT_ICON_SET", { operationId: shortId(operationId), kind });

  resetTimerId = setTimeout(() => {
    void resetResultIfCurrent(operationId);
  }, RESULT_DISPLAY_MS);
}

async function setProcessingIndicator(operationId, title) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId || operation.phase !== "processing") return;

  await chrome.action.setIcon({ path: ICONS.PROCESSING });
  await chrome.action.setTitle({ title });
  trace("PROCESSING_ICON_SET", { operationId: shortId(operationId) });
}

async function resetResultIfCurrent(operationId) {
  const stored = await chrome.storage.session.get([OPERATION_KEY, ICON_STATE_KEY]);
  const operation = stored[OPERATION_KEY];
  const iconState = stored[ICON_STATE_KEY];

  if (operation?.id !== operationId || iconState?.operationId !== operationId) return;

  if (resetTimerId !== null) {
    clearTimeout(resetTimerId);
    resetTimerId = null;
  }

  await setDefaultIcon();
  await chrome.storage.session.remove([ICON_STATE_KEY, OPERATION_KEY]);
  trace("OPERATION_RELEASED", { operationId: shortId(operationId) });
}

async function clearOperationToDefault(operationId) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;

  await setDefaultIcon();
  await chrome.storage.session.remove([ICON_STATE_KEY, OPERATION_KEY]);
}

async function recoverAndCheckOccupied() {
  const stored = await chrome.storage.session.get([OPERATION_KEY, ICON_STATE_KEY]);
  const operation = stored[OPERATION_KEY];
  const iconState = stored[ICON_STATE_KEY];
  const now = Date.now();

  if (iconState?.operationId && operation?.id === iconState.operationId) {
    if (iconState.resetAt <= now) {
      await resetResultIfCurrent(operation.id);
      return false;
    }

    await chrome.action.setIcon({ path: ICONS[iconState.kind] || ICONS.ERROR });
    await chrome.action.setTitle({ title: titleForResult(iconState.kind) });
    scheduleRemainingReset(operation.id, iconState.resetAt - now);
    return true;
  }

  if (!operation) return false;

  if (operation.expiresAt <= now) {
    await displayResult(operation.id, "ERROR", new Error("A previous operation expired before completion."));
    return true;
  }

  if (operation.phase === "processing") {
    await chrome.action.setIcon({ path: ICONS.PROCESSING });
    await chrome.action.setTitle({ title: "SnapGrok is processing the captured screenshot…" });
    return true;
  }

  if (operation.phase === "selecting") {
    await chrome.action.setTitle({ title: "SnapGrok: drag to select a screenshot area" });
    return true;
  }

  return true;
}

async function restoreRuntimeState() {
  try {
    const stored = await chrome.storage.session.get([OPERATION_KEY, ICON_STATE_KEY]);
    const operation = stored[OPERATION_KEY];
    const iconState = stored[ICON_STATE_KEY];
    const now = Date.now();

    if (iconState?.operationId && operation?.id === iconState.operationId) {
      if (iconState.resetAt <= now) {
        await resetResultIfCurrent(operation.id);
        return;
      }

      await chrome.action.setIcon({ path: ICONS[iconState.kind] || ICONS.ERROR });
      await chrome.action.setTitle({ title: titleForResult(iconState.kind) });
      scheduleRemainingReset(operation.id, iconState.resetAt - now);
      return;
    }

    if (operation?.phase === "processing" && operation.expiresAt > now) {
      await chrome.action.setIcon({ path: ICONS.PROCESSING });
      await chrome.action.setTitle({ title: "SnapGrok is processing the captured screenshot…" });
      return;
    }

    if (operation?.phase === "selecting" && operation.expiresAt > now) {
      await chrome.action.setTitle({ title: "SnapGrok: drag to select a screenshot area" });
      return;
    }

    if (operation?.expiresAt <= now) {
      await displayResult(operation.id, "ERROR", new Error("An interrupted operation was recovered."));
      return;
    }

    if (!operation) await setDefaultIcon();
  } catch (error) {
    console.error(error);
    await setDefaultIcon();
    await chrome.storage.session.remove([OPERATION_KEY, ICON_STATE_KEY]);
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
  if (!operation || operation.phase !== "selecting" || operation.tabId !== tabId) return;
  await displayResult(operation.id, "ERROR", new Error("The selected page was closed or navigated."));
}

async function showSystemErrorForCurrentOperation(error) {
  const operation = await getOperation();
  if (operation) {
    await displayResult(operation.id, "ERROR", error);
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
  await displayResult(operation.id, "ERROR", error);
}

async function setDefaultIcon() {
  await chrome.action.setIcon({ path: ICONS.default });
  await chrome.action.setTitle({ title: "Open SnapGrok settings" });
}

function titleForResult(kind) {
  if (kind === "ERROR") return "SnapGrok system error · resets in 5 seconds";
  if (kind === "F") return "SnapGrok inconclusive · resets in 5 seconds";
  return `SnapGrok answer: ${kind} · resets in 5 seconds`;
}

function normalizeRectangle(rectangle, viewport) {
  const x = Number(rectangle?.x);
  const y = Number(rectangle?.y);
  const width = Number(rectangle?.width);
  const height = Number(rectangle?.height);
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);

  if (![x, y, width, height, viewportWidth, viewportHeight].every(Number.isFinite)) return null;
  if (width < 5 || height < 5 || viewportWidth <= 0 || viewportHeight <= 0) return null;

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

    const sx = clamp(Math.round(rectangle.x * scaleX), 0, Math.max(0, bitmap.width - 1));
    const sy = clamp(Math.round(rectangle.y * scaleY), 0, Math.max(0, bitmap.height - 1));
    const sw = clamp(Math.round(rectangle.width * scaleX), 1, bitmap.width - sx);
    const sh = clamp(Math.round(rectangle.height * scaleY), 1, bitmap.height - sy);

    const canvas = new OffscreenCanvas(sw, sh);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Chrome could not create the screenshot crop canvas.");

    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const croppedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
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

function shortId(value) {
  return typeof value === "string" ? value.slice(0, 8) : "unknown";
}
