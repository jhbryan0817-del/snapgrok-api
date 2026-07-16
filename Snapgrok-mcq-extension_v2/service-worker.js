importScripts("shared.js");

const SERVER_URL = "https://snapgrok-api.onrender.com";
const SERVER_MINIMUM_WORD_LIMIT = 20;
const RESULT_DISPLAY_MS = 5000;
const OPERATION_STATE_KEY = "operationState";

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

const TITLES = {
  default: "Open SnapGrok settings",
  A: "SnapGrok answer: A",
  B: "SnapGrok answer: B",
  C: "SnapGrok answer: C",
  D: "SnapGrok answer: D",
  E: "SnapGrok answer: E",
  F: "SnapGrok: inconclusive",
  ERROR: "SnapGrok: system error",
};

let resetTimerId = null;
let workQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  enqueue(async () => {
    await SnapGrok.getSettings();
    await resetToDefault();
  });
});

chrome.runtime.onStartup.addListener(() => enqueue(restoreOperationState));

chrome.commands.onCommand.addListener((command) => {
  if (command !== "capture-full-screen" && command !== "capture-selected-zone") return;
  enqueue(() => handleCommand(command));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SNAPGROK_ZONE_SELECTED" && message?.type !== "SNAPGROK_ZONE_CANCELLED") {
    return false;
  }

  enqueue(() => handleZoneMessage(message, sender))
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(async () => {
    const state = await getOperationState();
    if (state?.status === "selecting" && state.tabId === tabId) {
      await displayResult("ERROR");
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  enqueue(async () => {
    const state = await getOperationState();
    if (state?.status === "selecting" && state.tabId === tabId) {
      await displayResult("ERROR");
    }
  });
});

enqueue(restoreOperationState);

function enqueue(task) {
  workQueue = workQueue.then(task, task).catch(async () => {
    await displayResult("ERROR").catch(() => {});
  });
  return workQueue;
}

function iconPath(baseName) {
  return {
    16: `icons/${baseName}16.png`,
    32: `icons/${baseName}32.png`,
    48: `icons/${baseName}48.png`,
    128: `icons/${baseName}128.png`,
  };
}

async function handleCommand(command) {
  if (await operationIsBusy()) return;

  const settings = await SnapGrok.getSettings();
  if (!settings.instruction) {
    await displayResult("ERROR");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.windowId) {
    await displayResult("ERROR");
    return;
  }

  if (command === "capture-full-screen") {
    await setOperationState({
      status: "analyzing",
      mode: "full-screen",
      tabId: tab.id,
      windowId: tab.windowId,
      startedAt: Date.now(),
    });

    try {
      const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 90,
      });
      await analyzeAndDisplay(imageDataUrl, settings.instruction);
    } catch {
      await displayResult("ERROR");
    }
    return;
  }

  await setOperationState({
    status: "selecting",
    mode: "selected-zone",
    tabId: tab.id,
    windowId: tab.windowId,
    startedAt: Date.now(),
  });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["zone-selector.js"],
    });
  } catch {
    await displayResult("ERROR");
  }
}

async function handleZoneMessage(message, sender) {
  const state = await getOperationState();
  if (state?.status !== "selecting") return;
  if (!sender.tab?.id || sender.tab.id !== state.tabId) return;

  if (message.type === "SNAPGROK_ZONE_CANCELLED") {
    await resetToDefault();
    return;
  }

  const selection = normalizeSelection(message.selection);
  if (!selection) {
    await displayResult("ERROR");
    return;
  }

  const tab = await chrome.tabs.get(sender.tab.id).catch(() => null);
  if (!tab?.active || tab.windowId !== state.windowId) {
    await displayResult("ERROR");
    return;
  }

  await setOperationState({
    ...state,
    status: "analyzing",
    startedAt: Date.now(),
  });

  try {
    const settings = await SnapGrok.getSettings();
    if (!settings.instruction) throw new Error("Instruction missing.");

    const visibleTabDataUrl = await chrome.tabs.captureVisibleTab(state.windowId, {
      format: "jpeg",
      quality: 90,
    });
    const croppedDataUrl = await cropVisibleTab(visibleTabDataUrl, selection);
    await analyzeAndDisplay(croppedDataUrl, settings.instruction);
  } catch {
    await displayResult("ERROR");
  }
}

function normalizeSelection(value) {
  if (!value || typeof value !== "object") return null;

  const numbers = [
    value.x,
    value.y,
    value.width,
    value.height,
    value.viewportWidth,
    value.viewportHeight,
  ].map(Number);

  if (numbers.some((number) => !Number.isFinite(number))) return null;

  const [x, y, width, height, viewportWidth, viewportHeight] = numbers;
  if (width < 8 || height < 8 || viewportWidth <= 0 || viewportHeight <= 0) return null;

  return { x, y, width, height, viewportWidth, viewportHeight };
}

async function cropVisibleTab(dataUrl, selection) {
  const sourceBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const scaleX = bitmap.width / selection.viewportWidth;
    const scaleY = bitmap.height / selection.viewportHeight;

    const sourceX = clamp(Math.round(selection.x * scaleX), 0, bitmap.width - 1);
    const sourceY = clamp(Math.round(selection.y * scaleY), 0, bitmap.height - 1);
    const sourceWidth = clamp(Math.round(selection.width * scaleX), 1, bitmap.width - sourceX);
    const sourceHeight = clamp(Math.round(selection.height * scaleY), 1, bitmap.height - sourceY);

    const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas context unavailable.");

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

    const croppedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    return blobToDataUrl(croppedBlob);
  } finally {
    bitmap.close();
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
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

async function analyzeAndDisplay(imageDataUrl, userInstruction) {
  try {
    const response = await fetch(`${SERVER_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        imageDataUrl,
        instruction: buildInstruction(userInstruction),
        maxWords: SERVER_MINIMUM_WORD_LIMIT,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload.text !== "string") {
      await displayResult("ERROR");
      return;
    }

    const choice = parseChoice(payload.text);
    await displayResult(choice || "F");
  } catch {
    await displayResult("ERROR");
  }
}

function buildInstruction(userInstruction) {
  return [
    userInstruction.trim(),
    "The screenshot contains a multiple-choice question. Determine the single best answer from choices A, B, C, D, or E.",
    "If the question cannot be read, is incomplete, has no defensible single answer, or you cannot determine the answer with sufficient confidence, return F for inconclusive.",
    "FINAL OUTPUT RULE: Return exactly one uppercase character: A, B, C, D, E, or F. Return no words, explanation, punctuation, markdown, or extra whitespace.",
  ].join("\n\n");
}

function parseChoice(value) {
  const text = String(value || "")
    .toUpperCase()
    .replace(/[`*_#]/g, "")
    .trim();

  const single = text.match(/^\(?\s*([A-F])\s*\)?[.!]?$/);
  if (single) return single[1];

  if (/^INCONCLUSIVE[.!]?$/.test(text)) return "F";

  const labelled = text.match(
    /(?:ANSWER|CHOICE|OPTION|FINAL(?:\s+ANSWER)?)\s*(?:IS|:|=|-)?\s*\(?([A-F])\)?[.!]?\s*$/,
  );
  return labelled ? labelled[1] : null;
}

async function operationIsBusy() {
  const state = await getOperationState();
  if (!state) return false;

  if (state.status === "displaying" && Number(state.resetAt) <= Date.now()) {
    await resetToDefault();
    return false;
  }

  return ["selecting", "analyzing", "displaying"].includes(state.status);
}

async function displayResult(symbol) {
  const safeSymbol = ICONS[symbol] ? symbol : "ERROR";
  const token = crypto.randomUUID();
  const resetAt = Date.now() + RESULT_DISPLAY_MS;

  clearResetTimer();
  await chrome.action.setIcon({ path: ICONS[safeSymbol] });
  await chrome.action.setTitle({ title: TITLES[safeSymbol] });
  await setOperationState({
    status: "displaying",
    symbol: safeSymbol,
    token,
    resetAt,
  });

  resetTimerId = setTimeout(() => {
    enqueue(() => resetIfCurrent(token));
  }, RESULT_DISPLAY_MS);
}

async function resetIfCurrent(token) {
  const state = await getOperationState();
  if (state?.status !== "displaying" || state.token !== token) return;
  await resetToDefault();
}

async function restoreOperationState() {
  const state = await getOperationState();
  if (!state) {
    await setDefaultIcon();
    return;
  }

  if (state.status === "displaying" && ICONS[state.symbol]) {
    if (Number(state.resetAt) <= Date.now()) {
      await resetToDefault();
      return;
    }

    await chrome.action.setIcon({ path: ICONS[state.symbol] });
    await chrome.action.setTitle({ title: TITLES[state.symbol] });
    clearResetTimer();
    resetTimerId = setTimeout(() => {
      enqueue(() => resetIfCurrent(state.token));
    }, Math.max(Number(state.resetAt) - Date.now(), 0));
    return;
  }

  // A browser restart or service-worker loss during analysis cannot resume the
  // network request. Represent that condition as a system error.
  if (state.status === "analyzing") {
    await displayResult("ERROR");
    return;
  }

  // A zone selector runs in the page and can wake this worker through a message,
  // so a valid selecting state is retained.
  if (state.status === "selecting") {
    const stale = Date.now() - Number(state.startedAt || 0) > 120000;
    if (stale) await resetToDefault();
    return;
  }

  await resetToDefault();
}

async function setDefaultIcon() {
  await chrome.action.setIcon({ path: ICONS.default });
  await chrome.action.setTitle({ title: TITLES.default });
}

async function resetToDefault() {
  clearResetTimer();
  await setDefaultIcon();
  await chrome.storage.session.remove(OPERATION_STATE_KEY);
}

function clearResetTimer() {
  if (resetTimerId !== null) {
    clearTimeout(resetTimerId);
    resetTimerId = null;
  }
}

async function getOperationState() {
  const stored = await chrome.storage.session.get(OPERATION_STATE_KEY);
  return stored[OPERATION_STATE_KEY] || null;
}

async function setOperationState(state) {
  await chrome.storage.session.set({ [OPERATION_STATE_KEY]: state });
}
