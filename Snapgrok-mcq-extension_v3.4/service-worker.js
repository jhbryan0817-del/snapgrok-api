importScripts("shared.js");

const SERVER_URL = "https://snapgrok-api.onrender.com";
const COMMAND_FULL = "capture-full-screen";
const COMMAND_ZONE = "capture-selected-zone";
const OPERATION_KEY = "snapgrokV34Operation";
const ICON_DISPLAY_MS = 5000;
const SELECTION_MAX_MS = 120000;
const ANALYSIS_MAX_MS = 210000;
const MIN_SERVER_WORD_LIMIT = 20;

const ICONS = {
  default: iconPath("default"),
  A: iconPath("answer-a"),
  B: iconPath("answer-b"),
  C: iconPath("answer-c"),
  D: iconPath("answer-d"),
  E: iconPath("answer-e"),
  F: iconPath("inconclusive"),
  ERROR: iconPath("system-error"),
};

let commandStarting = false;
let resetTimerId = null;

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension().catch(logTechnicalError);
});

chrome.runtime.onStartup.addListener(() => {
  restoreOperationState().catch(logTechnicalError);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== COMMAND_FULL && command !== COMMAND_ZONE) return;
  if (commandStarting) return;

  commandStarting = true;
  handleCommand(command)
    .catch((error) => showStandaloneSystemError(error))
    .finally(() => {
      commandStarting = false;
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SNAPGROK_SELECTION_COMPLETE") {
    sendResponse({ accepted: true });
    void processSelectedZone(message, sender).catch((error) =>
      failCurrentOperation(message.operationId, error),
    );
    return false;
  }

  if (message?.type === "SNAPGROK_SELECTION_CANCELLED") {
    sendResponse({ accepted: true });
    void cancelSelection(message.operationId, sender).catch(logTechnicalError);
    return false;
  }

  if (message?.type === "SNAPGROK_SELECTION_ERROR") {
    sendResponse({ accepted: true });
    void failCurrentOperation(
      message.operationId,
      new Error("The screen-area selector failed."),
    );
    return false;
  }

  return false;
});

initializeExtension().catch(logTechnicalError);

function iconPath(baseName) {
  return {
    16: `icons/${baseName}16.png`,
    32: `icons/${baseName}32.png`,
    48: `icons/${baseName}48.png`,
    128: `icons/${baseName}128.png`,
  };
}

function logTechnicalError(error) {
  console.error(`[SnapGrok] ${error?.message || "Unexpected technical error."}`);
}

async function initializeExtension() {
  await SnapGrokV34.getSettings();
  await restoreOperationState();
}

async function handleCommand(command) {
  const existing = await readActiveOperation();
  if (existing) return;

  const settings = await SnapGrokV34.getSettings();
  const userInstruction = settings.instruction.trim();

  if (!userInstruction) {
    await showStandaloneSystemError(new Error("No instruction has been saved."));
    return;
  }

  // This deliberately follows V1's reliable active-tab lookup.
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!activeTab?.id || !activeTab.windowId) {
    await showStandaloneSystemError(new Error("No active Chrome tab was found."));
    return;
  }

  const operation = {
    id: crypto.randomUUID(),
    mode: command === COMMAND_FULL ? "full" : "zone",
    phase: command === COMMAND_FULL ? "capturing" : "selecting",
    tabId: activeTab.id,
    windowId: activeTab.windowId,
    startedAt: Date.now(),
    expiresAt:
      Date.now() +
      (command === COMMAND_FULL ? ANALYSIS_MAX_MS : SELECTION_MAX_MS),
  };

  await writeOperation(operation);
  await chrome.action.setTitle({
    title:
      command === COMMAND_FULL
        ? "SnapGrok is capturing the visible tab…"
        : "Drag to select a screenshot area. Press Escape to cancel.",
  });

  if (command === COMMAND_FULL) {
    await processFullCapture(operation, userInstruction);
    return;
  }

  try {
    await startSelector(activeTab.id, operation.id);
  } catch (error) {
    await failCurrentOperation(operation.id, error);
  }
}

async function processFullCapture(operation, userInstruction) {
  try {
    const imageDataUrl = await chrome.tabs.captureVisibleTab(operation.windowId, {
      format: "jpeg",
      quality: 88,
    });

    await updateOperationPhase(operation.id, "analyzing", ANALYSIS_MAX_MS);
    const choice = await analyzeImage(imageDataUrl, userInstruction);
    await showResult(operation.id, choice);
  } catch (error) {
    await failCurrentOperation(operation.id, error);
  }
}

async function startSelector(tabId, operationId) {
  const startMessage = {
    type: "SNAPGROK_START_SELECTION",
    operationId,
  };

  try {
    const response = await chrome.tabs.sendMessage(tabId, startMessage);
    if (response?.ready) return;
  } catch {
    // A tab that was already open before installation may not yet contain the
    // declarative content script. Inject the same listener once as a fallback.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-selector.js"],
  });

  const response = await chrome.tabs.sendMessage(tabId, startMessage);
  if (!response?.ready) {
    throw new Error("The screen-area selector did not initialize.");
  }
}

async function processSelectedZone(message, sender) {
  const operation = await getOperation();
  if (!operation || operation.id !== message.operationId) return;
  if (operation.phase !== "selecting") return;
  if (sender.tab?.id !== operation.tabId) return;

  validateSelection(message);

  const [activeTab] = await chrome.tabs.query({
    active: true,
    windowId: operation.windowId,
  });

  if (activeTab?.id !== operation.tabId) {
    throw new Error("The selected tab was no longer active when capture began.");
  }

  await updateOperationPhase(operation.id, "capturing", ANALYSIS_MAX_MS);

  const fullImageDataUrl = await chrome.tabs.captureVisibleTab(operation.windowId, {
    format: "jpeg",
    quality: 90,
  });

  const croppedImageDataUrl = await cropScreenshot(
    fullImageDataUrl,
    message.rect,
    message.viewport,
  );

  const settings = await SnapGrokV34.getSettings();
  const userInstruction = settings.instruction.trim();
  if (!userInstruction) {
    throw new Error("No instruction has been saved.");
  }

  await updateOperationPhase(operation.id, "analyzing", ANALYSIS_MAX_MS);
  const choice = await analyzeImage(croppedImageDataUrl, userInstruction);
  await showResult(operation.id, choice);
}

function validateSelection(message) {
  const { rect, viewport } = message;

  const values = [
    rect?.x,
    rect?.y,
    rect?.width,
    rect?.height,
    viewport?.width,
    viewport?.height,
  ];

  if (!values.every((value) => Number.isFinite(Number(value)))) {
    throw new Error("The selected screenshot area was invalid.");
  }

  if (
    Number(rect.width) < 4 ||
    Number(rect.height) < 4 ||
    Number(viewport.width) < 1 ||
    Number(viewport.height) < 1
  ) {
    throw new Error("The selected screenshot area was too small.");
  }
}

async function cropScreenshot(imageDataUrl, rect, viewport) {
  const imageBlob = await (await fetch(imageDataUrl)).blob();
  const bitmap = await createImageBitmap(imageBlob);

  try {
    const scaleX = bitmap.width / Number(viewport.width);
    const scaleY = bitmap.height / Number(viewport.height);

    const sourceX = clamp(
      Math.round(Number(rect.x) * scaleX),
      0,
      Math.max(bitmap.width - 1, 0),
    );
    const sourceY = clamp(
      Math.round(Number(rect.y) * scaleY),
      0,
      Math.max(bitmap.height - 1, 0),
    );
    const sourceWidth = clamp(
      Math.round(Number(rect.width) * scaleX),
      1,
      bitmap.width - sourceX,
    );
    const sourceHeight = clamp(
      Math.round(Number(rect.height) * scaleY),
      1,
      bitmap.height - sourceY,
    );

    const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Screenshot cropping could not start.");

    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );

    const croppedBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.9,
    });

    return blobToDataUrl(croppedBlob);
  } finally {
    bitmap.close();
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(maximum, minimum));
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function analyzeImage(imageDataUrl, userInstruction) {
  const response = await fetch(`${SERVER_URL}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      imageDataUrl,
      instruction: buildStrictInstruction(userInstruction),
      maxWords: MIN_SERVER_WORD_LIMIT,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `The server returned HTTP ${response.status}.`);
  }

  const choice = parseChoice(payload.text);
  if (!choice) {
    throw new Error("Grok did not return a recognizable A-F result.");
  }

  return choice;
}

function buildStrictInstruction(userInstruction) {
  return [
    userInstruction.trim(),
    "The screenshot contains a multiple-choice problem. Determine the single best answer from choices A, B, C, D, or E.",
    "If the problem cannot be read, the answer cannot be determined, or there is not enough information, return F.",
    "FINAL OUTPUT RULE: Return exactly one uppercase character: A, B, C, D, E, or F. F means inconclusive. Do not include words, explanation, punctuation, markdown, or extra whitespace.",
  ].join("\n\n");
}

function parseChoice(value) {
  const text = String(value || "")
    .toUpperCase()
    .replace(/[`*_#]/g, "")
    .trim();

  const single = text.match(/^\(?\s*([A-F])\s*\)?[.!]?$/);
  if (single) return single[1];

  const labelled = text.match(
    /(?:ANSWER|CHOICE|OPTION|FINAL)\s*(?:ANSWER\s*)?(?:IS|:|=|-)??\s*\(?([A-F])\)?[.!]?\s*$/,
  );
  return labelled ? labelled[1] : null;
}

async function showResult(operationId, result) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;
  if (!ICONS[result]) throw new Error("An invalid result icon was requested.");

  const resetAt = Date.now() + ICON_DISPLAY_MS;
  const updated = {
    ...operation,
    phase: "result",
    result,
    resetAt,
    expiresAt: resetAt,
  };

  if (resetTimerId !== null) clearTimeout(resetTimerId);

  await chrome.action.setIcon({ path: ICONS[result] });
  await chrome.action.setTitle({
    title:
      result === "ERROR"
        ? "SnapGrok system error · resets in 5 seconds"
        : result === "F"
          ? "SnapGrok result: inconclusive · resets in 5 seconds"
          : `SnapGrok answer: ${result} · resets in 5 seconds`,
  });
  await writeOperation(updated);

  resetTimerId = setTimeout(() => {
    resetResultIfCurrent(operationId).catch(logTechnicalError);
  }, ICON_DISPLAY_MS);
}

async function failCurrentOperation(operationId, error) {
  logTechnicalError(error);
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;
  await showResult(operationId, "ERROR");
}

async function showStandaloneSystemError(error) {
  logTechnicalError(error);

  const existing = await readActiveOperation();
  if (existing) return;

  const operation = {
    id: crypto.randomUUID(),
    mode: "error",
    phase: "capturing",
    tabId: null,
    windowId: null,
    startedAt: Date.now(),
    expiresAt: Date.now() + ICON_DISPLAY_MS,
  };
  await writeOperation(operation);
  await showResult(operation.id, "ERROR");
}

async function cancelSelection(operationId, sender) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;
  if (operation.phase !== "selecting") return;
  if (sender.tab?.id !== operation.tabId) return;
  await resetDefaultAndUnlock(operationId);
}

async function updateOperationPhase(operationId, phase, durationMs) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) {
    throw new Error("The screenshot operation was no longer active.");
  }

  await writeOperation({
    ...operation,
    phase,
    expiresAt: Date.now() + durationMs,
  });
}

async function readActiveOperation() {
  const operation = await getOperation();
  if (!operation) return null;

  if (operation.phase === "result") {
    if (Number(operation.resetAt) <= Date.now()) {
      await resetDefaultAndUnlock(operation.id);
      return null;
    }

    await restoreResultIcon(operation);
    return operation;
  }

  if (Number(operation.expiresAt) <= Date.now()) {
    await showResult(operation.id, "ERROR");
    return await getOperation();
  }

  return operation;
}

async function restoreOperationState() {
  const operation = await getOperation();
  if (!operation) {
    await setDefaultIcon();
    return;
  }

  if (operation.phase === "result") {
    if (Number(operation.resetAt) <= Date.now()) {
      await resetDefaultAndUnlock(operation.id);
    } else {
      await restoreResultIcon(operation);
    }
    return;
  }

  if (Number(operation.expiresAt) <= Date.now()) {
    await showResult(operation.id, "ERROR");
    return;
  }

  // A selector can survive a normal service-worker suspension because the
  // content script remains on the page and can wake this worker with its
  // completed rectangle. Capture, crop, and fetch promises cannot be resumed
  // after a worker restart, so represent those interrupted phases as a system
  // error instead of leaving an invisible lock in place.
  if (operation.phase !== "selecting") {
    await showResult(operation.id, "ERROR");
  }
}

async function restoreResultIcon(operation) {
  if (!ICONS[operation.result]) {
    await resetDefaultAndUnlock(operation.id);
    return;
  }

  await chrome.action.setIcon({ path: ICONS[operation.result] });
  await chrome.action.setTitle({
    title:
      operation.result === "ERROR"
        ? "SnapGrok system error · resets in 5 seconds"
        : operation.result === "F"
          ? "SnapGrok result: inconclusive · resets in 5 seconds"
          : `SnapGrok answer: ${operation.result} · resets in 5 seconds`,
  });

  if (resetTimerId !== null) clearTimeout(resetTimerId);
  resetTimerId = setTimeout(() => {
    resetResultIfCurrent(operation.id).catch(logTechnicalError);
  }, Math.max(Number(operation.resetAt) - Date.now(), 0));
}

async function resetResultIfCurrent(operationId) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId || operation.phase !== "result") {
    return;
  }

  await resetDefaultAndUnlock(operationId);
}

async function resetDefaultAndUnlock(operationId) {
  const operation = await getOperation();
  if (operation && operation.id !== operationId) return;

  if (resetTimerId !== null) {
    clearTimeout(resetTimerId);
    resetTimerId = null;
  }

  // The required order is deliberate: restore the default icon first, and
  // only then remove the operation lock.
  await setDefaultIcon();
  await chrome.storage.session.remove(OPERATION_KEY);
}

async function setDefaultIcon() {
  await chrome.action.setIcon({ path: ICONS.default });
  await chrome.action.setTitle({ title: "Open SnapGrok MCQ settings" });
}

async function getOperation() {
  const stored = await chrome.storage.session.get(OPERATION_KEY);
  const operation = stored[OPERATION_KEY];
  return operation && typeof operation === "object" ? operation : null;
}

async function writeOperation(operation) {
  await chrome.storage.session.set({ [OPERATION_KEY]: operation });
}
