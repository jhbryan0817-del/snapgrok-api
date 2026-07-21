importScripts("auth-config.js", "clerk-auth.js", "settings.js", "protocol.js");

"use strict";

const COMMAND_FULL = "capture-full-screen";
const COMMAND_ZONE = "capture-selected-zone";
const SERVER_URL = SnapGrokAuthConfig.serverUrl;
const MAX_WORDS = 60;
const RESULT_DISPLAY_MS = 4000;
const SELECTION_TTL_MS = 90000;
const PROCESSING_TTL_MS = 150000;
const OFFSCREEN_REQUEST_TIMEOUT_MS = 120000;
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const PROCESSING_ALARM_PREFIX = "snapgrok-processing-";
const AUTH_COOKIE_SETTLE_MS = 250;
const OPERATION_KEY = "snapgrokOperation";
const ICON_STATE_KEY = "snapgrokIconState";

const ICONS = {
  default: iconPath("default"),
  processing: iconPath("processing"),
  inconclusive: iconPath("result-inconclusive"),
  error: iconPath("result-error"),
};

let commandGate = false;
let resetTimerId = null;
let authCookieTimerId = null;

// Registered synchronously at top level so Chrome can wake the worker and
// deliver shortcut events without waiting for any initialization promise.
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
  if (
    message?.target === "service-worker" &&
    message?.type === "SNAPGROK_GET_AUTH_SNAPSHOT"
  ) {
    if (!isTrustedExtensionPage(sender)) {
      sendResponse({ ok: false, error: "AUTH_SNAPSHOT_NOT_ALLOWED" });
      return false;
    }

    SnapGrokAuth.getAuthSnapshot()
      .then((snapshot) => {
        sendResponse({
          ok: true,
          snapshot: {
            isSignedIn: snapshot.isSignedIn,
            email: snapshot.email,
            displayName: snapshot.displayName,
          },
        });
      })
      .catch(() => {
        sendResponse({ ok: false, error: "AUTH_SNAPSHOT_UNAVAILABLE" });
      });
    return true;
  }

  if (
    message?.target === "service-worker" &&
    message?.type === "SNAPGROK_GET_FRESH_SESSION_TOKEN"
  ) {
    if (!isTrustedOffscreenDocument(sender)) {
      sendResponse({ ok: false, error: "AUTH_TOKEN_NOT_ALLOWED" });
      return false;
    }

    SnapGrokAuth.getSessionToken({ forceRefresh: true })
      .then((token) => sendResponse({ ok: Boolean(token), token: token || null }))
      .catch(() => sendResponse({ ok: false, token: null, error: "AUTH_TOKEN_UNAVAILABLE" }));
    return true;
  }

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

  if (message?.type === "SNAPGROK_OFFSCREEN_ANALYSIS_COMPLETE") {
    sendResponse({ accepted: true });
    void handleOffscreenAnalysisComplete(message).catch((error) => {
      void showSystemErrorForCurrentOperation(error);
    });
    return false;
  }

  return false;
});

function isTrustedExtensionPage(sender) {
  return (
    sender?.id === chrome.runtime.id &&
    typeof sender.url === "string" &&
    sender.url.startsWith(chrome.runtime.getURL(""))
  );
}

function isTrustedOffscreenDocument(sender) {
  return (
    isTrustedExtensionPage(sender) &&
    sender.url === chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)
  );
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreRuntimeState();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(PROCESSING_ALARM_PREFIX)) return;
  const operationId = alarm.name.slice(PROCESSING_ALARM_PREFIX.length);
  void failExpiredProcessingOperation(operationId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void failSelectionIfTabDisappeared(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    void failSelectionIfTabDisappeared(tabId);
  }
});

chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!SnapGrokAuth.isSyncCookieChange(changeInfo)) return;

  if (authCookieTimerId !== null) clearTimeout(authCookieTimerId);
  authCookieTimerId = setTimeout(() => {
    authCookieTimerId = null;
    void reconcileAuthStateAfterCookieChange();
  }, AUTH_COOKIE_SETTLE_MS);
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
  // Diagnostics deliberately exclude screenshots, instructions, URLs, model
  // output, and answers.
  console.debug(`[SnapGrok V4.1] ${eventName}`, details);
}

async function reconcileAuthStateAfterCookieChange() {
  try {
    const snapshot = await SnapGrokAuth.getAuthSnapshot();
    await broadcastAuthSnapshot(snapshot);

    if (!snapshot.isSignedIn) {
      await stopActiveOperationForSignedOutSession();
    }
  } catch {
    trace("AUTH_STATE_REFRESH_FAILED");
  }
}

async function broadcastAuthSnapshot(snapshot) {
  await chrome.runtime.sendMessage({
    type: "SNAPGROK_AUTH_STATE_CHANGED",
    snapshot: {
      isSignedIn: snapshot.isSignedIn,
      email: snapshot.email,
      displayName: snapshot.displayName,
    },
  }).catch(() => undefined);
}

async function stopActiveOperationForSignedOutSession() {
  const operation = await getOperation();
  if (!operation || operation.phase === "result") return;

  if (operation.phase === "selecting" && Number.isInteger(operation.tabId)) {
    await chrome.tabs.sendMessage(operation.tabId, {
      type: "SNAPGROK_STOP_ZONE_SELECTOR",
      operationId: operation.id,
    }).catch(() => undefined);
  }

  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "SNAPGROK_OFFSCREEN_ABORT_ANALYSIS",
    operationId: operation.id,
    reason: "Your SnapGrok session ended. Sign in again before capturing another question.",
  }).catch(() => undefined);
  await closeOffscreenDocumentQuietly();
  await clearProcessingAlarm(operation.id);
  await displayOutcome(
    operation.id,
    errorOutcome(),
    new Error("Your SnapGrok session ended. Sign in again before capturing another question."),
  );
}

async function initializeExtension() {
  await closeOffscreenDocumentQuietly();
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

  const authToken = await SnapGrokAuth.getSessionToken();
  if (!authToken) {
    throw new Error("Sign in to SnapGrok from the extension popup before capturing a question.");
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
      await setProcessingIndicator(
        operation.id,
        "SnapGrok captured the visible tab and is analyzing it…",
      );

      trace("FULL_CAPTURE_COMPLETED", { operationId: shortId(operation.id) });
      await analyzeAndDisplay(operation.id, imageDataUrl, settings.instruction, authToken);
      return;
    }

    await chrome.action.setTitle({ title: "SnapGrok: drag to select a screenshot area" });
    await startZoneSelector(tab.id, operation.id);
    trace("ZONE_SELECTOR_READY", { operationId: shortId(operation.id) });
  } catch (error) {
    await displayOutcome(operation.id, errorOutcome(), error);
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
      throw new Error(
        response?.error || firstError?.message || "The selector did not initialize.",
      );
    }
  }
}

async function handleZoneSelected(message, sender) {
  const operation = await getOperation();
  if (!operation || operation.id !== message.operationId || operation.phase !== "selecting") return;
  if (!sender.tab?.id || sender.tab.id !== operation.tabId) return;

  const rectangle = normalizeRectangle(message.rectangle, message.viewport);
  if (!rectangle) {
    await displayOutcome(
      operation.id,
      errorOutcome(),
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
      throw new Error("The selected tab was no longer active when capture began.");
    }

    const fullImageDataUrl = await chrome.tabs.captureVisibleTab(operation.windowId, {
      format: "jpeg",
      quality: 88,
    });

    const croppedImageDataUrl = await cropScreenshot(fullImageDataUrl, rectangle);
    await setProcessingIndicator(
      operation.id,
      "SnapGrok captured the selected area and is analyzing it…",
    );
    trace("ZONE_CAPTURE_COMPLETED", { operationId: shortId(operation.id) });

    const settings = await SnapGrokSettings.getSettings();
    if (!settings.instruction.trim()) throw new Error("No instruction has been saved.");

    await analyzeAndDisplay(operation.id, croppedImageDataUrl, settings.instruction);
  } catch (error) {
    await displayOutcome(operation.id, errorOutcome(), error);
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

  await displayOutcome(
    operation.id,
    errorOutcome(),
    new Error(typeof message.error === "string" ? message.error : "The selector failed."),
  );
}

async function analyzeAndDisplay(operationId, imageDataUrl, userInstruction, existingAuthToken = "") {
  const current = await getOperation();
  if (!current || current.id !== operationId || current.phase !== "processing") return;

  const expiresAt = Date.now() + PROCESSING_TTL_MS;
  await updateOperation(operationId, { expiresAt });
  await scheduleProcessingAlarm(operationId, expiresAt);

  try {
    const authToken = existingAuthToken || await SnapGrokAuth.getSessionToken();
    if (!authToken) {
      throw new Error("Your SnapGrok session expired. Open the extension and sign in again.");
    }

    await ensureOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "SNAPGROK_OFFSCREEN_START_ANALYSIS",
      operationId,
      serverUrl: SERVER_URL,
      authToken,
      timeoutMs: OFFSCREEN_REQUEST_TIMEOUT_MS,
      requestBody: {
        imageDataUrl,
        instruction: SnapGrokProtocol.buildInstruction(userInstruction),
        maxWords: MAX_WORDS,
      },
    });

    if (!response?.accepted) {
      throw new Error(response?.error || "The background request document did not accept the analysis request.");
    }

    trace("OFFSCREEN_REQUEST_ACCEPTED", { operationId: shortId(operationId) });
  } catch (error) {
    await clearProcessingAlarm(operationId);
    await closeOffscreenDocumentQuietly();
    await displayOutcome(operationId, errorOutcome(), error);
  }
}

async function handleOffscreenAnalysisComplete(message) {
  const operationId = typeof message?.operationId === "string" ? message.operationId : "";
  const operation = await getOperation();

  if (!operationId || !operation || operation.id !== operationId || operation.phase !== "processing") {
    await closeOffscreenDocumentQuietly();
    return;
  }

  await clearProcessingAlarm(operationId);
  await closeOffscreenDocumentQuietly();

  if (!message.ok) {
    const errorMessage = typeof message.error === "string" && message.error.trim()
      ? message.error.trim()
      : "The server request failed.";
    await displayOutcome(operationId, errorOutcome(), new Error(errorMessage));
    return;
  }

  const payload = message.payload;
  const outcome = SnapGrokProtocol.parseBackendPayload(payload);

  if (!outcome) {
    const responseShape = payload && typeof payload === "object"
      ? Object.keys(payload).slice(0, 12).join(", ")
      : typeof payload;
    await displayOutcome(
      operationId,
      errorOutcome(),
      new Error(`The AI response format could not be parsed. Backend fields: ${responseShape || "none"}.`),
    );
    return;
  }

  trace("SERVER_RESULT_RECEIVED", {
    operationId: shortId(operationId),
    resultType: outcome.status,
    answerCount: outcome.answers?.length || 0,
  });
  await displayOutcome(operationId, outcome);
}

let creatingOffscreenDocument = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  let exists = false;

  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });
    exists = contexts.length > 0;
  } else {
    const matchedClients = await clients.matchAll();
    exists = matchedClients.some((client) => client.url === offscreenUrl);
  }

  if (exists) return;

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["BLOBS"],
      justification: "Perform a transient long-running screenshot analysis request without relying on a service-worker fetch response within 30 seconds.",
    }).finally(() => {
      creatingOffscreenDocument = null;
    });
  }

  await creatingOffscreenDocument;
}

async function closeOffscreenDocumentQuietly() {
  try {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    let exists = false;

    if ("getContexts" in chrome.runtime) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      });
      exists = contexts.length > 0;
    } else {
      const matchedClients = await clients.matchAll();
      exists = matchedClients.some((client) => client.url === offscreenUrl);
    }

    if (exists) await chrome.offscreen.closeDocument();
  } catch (error) {
    console.debug(`[SnapGrok V4.1] Offscreen document cleanup skipped: ${error?.message || "Unknown error"}`);
  }
}

async function scheduleProcessingAlarm(operationId, when) {
  await chrome.alarms.create(`${PROCESSING_ALARM_PREFIX}${operationId}`, { when });
}

async function clearProcessingAlarm(operationId) {
  await chrome.alarms.clear(`${PROCESSING_ALARM_PREFIX}${operationId}`);
}

async function failExpiredProcessingOperation(operationId) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;
  if (operation.phase !== "processing" && operation.phase !== "capturing") return;
  if (operation.expiresAt > Date.now()) return;

  await closeOffscreenDocumentQuietly();
  await displayOutcome(
    operation.id,
    errorOutcome(),
    new Error("The server request exceeded the 120-second processing limit."),
  );
}

async function displayOutcome(operationId, rawOutcome, error = null) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;

  const outcome = normalizeOutcome(rawOutcome);

  if (error) {
    console.error(
      `[SnapGrok V4.1] ${error?.name || "Error"}: ${error?.message || "Unknown error"}`,
    );
  }

  await clearProcessingAlarm(operationId);

  const resetAt = Date.now() + RESULT_DISPLAY_MS;
  const iconState = { operationId, outcome, resetAt };

  if (resetTimerId !== null) clearTimeout(resetTimerId);

  await applyOutcomeVisual(outcome);
  await chrome.storage.session.set({
    [ICON_STATE_KEY]: iconState,
    [OPERATION_KEY]: {
      ...operation,
      phase: "result",
      expiresAt: resetAt,
    },
  });

  trace("RESULT_ICON_SET", {
    operationId: shortId(operationId),
    resultType: outcome.status,
    answerCount: outcome.answers.length,
  });

  resetTimerId = setTimeout(() => {
    void resetResultIfCurrent(operationId);
  }, RESULT_DISPLAY_MS);
}

async function applyOutcomeVisual(outcome) {
  await chrome.action.setIcon({ path: iconForOutcome(outcome) });
  await chrome.action.setTitle({ title: titleForOutcome(outcome) });
}

function iconForOutcome(outcome) {
  if (outcome.status === "inconclusive") return ICONS.inconclusive;
  if (outcome.status === "error") return ICONS.error;

  if (outcome.status === "answer" && outcome.answers.length === 1) {
    return iconPath(`result-${outcome.answers[0].toLowerCase()}`);
  }

  if (outcome.status === "answer" && outcome.answers.length > 1) {
    const count = Math.min(5, Math.max(2, outcome.answers.length));
    return iconPath(`result-multi-${count}`);
  }

  return ICONS.error;
}

function titleForOutcome(outcome) {
  const resetText = "resets in 4 seconds";

  if (outcome.status === "inconclusive") {
    return `SnapGrok: inconclusive · ${resetText}`;
  }

  if (outcome.status === "error") {
    return `SnapGrok system error · ${resetText}`;
  }

  if (outcome.answers.length === 1) {
    return `Correct answer: ${outcome.answers[0]} · ${resetText}`;
  }

  return `Correct options: ${outcome.answers.join(", ")} · ${outcome.answers.length} correct · ${resetText}`;
}

function normalizeOutcome(value) {
  if (value?.status === "inconclusive") {
    return { status: "inconclusive", answers: [] };
  }

  if (value?.status === "answer" && Array.isArray(value.answers)) {
    const answers = ["A", "B", "C", "D", "E"].filter((option) =>
      value.answers.map((answer) => String(answer).toUpperCase()).includes(option),
    );
    if (answers.length) return { status: "answer", answers };
  }

  return errorOutcome();
}

function errorOutcome() {
  return { status: "error", answers: [] };
}

async function setProcessingIndicator(operationId, title) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId || operation.phase !== "processing") return;

  await chrome.action.setIcon({ path: ICONS.processing });
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

  // Required order: default icon first, then release the overlap lock.
  await setDefaultIcon();
  await chrome.storage.session.remove([ICON_STATE_KEY, OPERATION_KEY]);
  trace("OPERATION_RELEASED", { operationId: shortId(operationId) });
}

async function clearOperationToDefault(operationId) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId) return;

  await clearProcessingAlarm(operationId);
  await closeOffscreenDocumentQuietly();
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

    await applyOutcomeVisual(normalizeOutcome(iconState.outcome));
    scheduleRemainingReset(operation.id, iconState.resetAt - now);
    return true;
  }

  if (!operation) return false;

  if (operation.expiresAt <= now) {
    await closeOffscreenDocumentQuietly();
    await displayOutcome(
      operation.id,
      errorOutcome(),
      new Error("A previous operation expired before completion."),
    );
    return true;
  }

  if (operation.phase === "processing" || operation.phase === "capturing") {
    await chrome.action.setIcon({ path: ICONS.processing });
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

      await applyOutcomeVisual(normalizeOutcome(iconState.outcome));
      scheduleRemainingReset(operation.id, iconState.resetAt - now);
      return;
    }

    if (
      (operation?.phase === "processing" || operation?.phase === "capturing")
      && operation.expiresAt > now
    ) {
      await chrome.action.setIcon({ path: ICONS.processing });
      await chrome.action.setTitle({ title: "SnapGrok is processing the captured screenshot…" });
      return;
    }

    if (operation?.phase === "selecting" && operation.expiresAt > now) {
      await chrome.action.setTitle({ title: "SnapGrok: drag to select a screenshot area" });
      return;
    }

    if (operation?.expiresAt <= now) {
      await closeOffscreenDocumentQuietly();
      await displayOutcome(
        operation.id,
        errorOutcome(),
        new Error("An interrupted operation was recovered."),
      );
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
  await displayOutcome(
    operation.id,
    errorOutcome(),
    new Error("The selected page was closed or navigated."),
  );
}

async function showSystemErrorForCurrentOperation(error) {
  const operation = await getOperation();
  if (operation) {
    await displayOutcome(operation.id, errorOutcome(), error);
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
  await displayOutcome(operation.id, errorOutcome(), error);
}

async function setDefaultIcon() {
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
