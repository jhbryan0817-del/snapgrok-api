importScripts("auth-config.js", "auth.js", "settings.js", "protocol.js");

"use strict";

const COMMAND_FULL = "capture-full-screen";
const COMMAND_ZONE = "capture-selected-zone";
const WEBSITE_ORIGIN = new URL(SnapGrokAuthConfig.websiteUrl).origin;
const MAX_WORDS = 60;
const STANDARD_RESULT_DISPLAY_MS = 4000;
const MULTIPLE_RESULT_DISPLAY_MS = 6000;
const SELECTION_TTL_MS = 90000;
const PROCESSING_TTL_MS = 150000;
const PROCESSING_ALARM_PREFIX = "snapgrok-processing-";
const JOB_POLL_ALARM_PREFIX = "snapgrok-job-poll-";
const OPERATION_KEY = "snapgrokOperation";
const ICON_STATE_KEY = "snapgrokIconState";
const ACTION_TITLES = Object.freeze({
  idle: "Open Zenaian settings",
  processing: "Zenaian - AI processing",
  inconclusive: "AI-generated result: inconclusive",
});

const ICONS = {
  default: iconPath("default"),
  processing: iconPath("processing"),
  inconclusive: iconPath("result-inconclusive"),
  error: iconPath("result-error"),
};

let commandGate = false;
let resetTimerId = null;
const activeJobPolls = new Set();

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

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isTrustedWebsite(sender)) return false;

  if (message?.type === "SNEAKSOLVE_EXTENSION_PING") {
    SnapGrokAuth.getAuthSnapshot({ verify: false })
      .then((snapshot) => sendResponse({
        installed: true,
        connected: snapshot.isSignedIn,
        accountId: snapshot.accountId,
        version: chrome.runtime.getManifest().version,
      }))
      .catch(() => sendResponse({
        installed: true,
        connected: false,
        version: chrome.runtime.getManifest().version,
      }));
    return true;
  }

  if (message?.type === "SNEAKSOLVE_EXTENSION_PAIRING_NONCE_REQUEST") {
    SnapGrokAuth.getOrCreatePairingNonce()
      .then((nonce) => sendResponse({ ok: true, nonce }))
      .catch(() => sendResponse({ ok: false, error: "PAIRING_NONCE_UNAVAILABLE" }));
    return true;
  }

  if (message?.type === "SNEAKSOLVE_EXTENSION_PAIR") {
    SnapGrokAuth.acceptPairing({
      pairingCode: message.pairingCode,
      nonce: message.nonce,
    })
      .then(async (snapshot) => {
        await broadcastAuthSnapshot(snapshot);
        sendResponse({ ok: true, connected: true });
      })
      .catch((error) => sendResponse({
        ok: false,
        error: String(error?.code || "PAIRING_FAILED"),
      }));
    return true;
  }

  if (message?.type === "SNEAKSOLVE_EXTENSION_REVOKED") {
    stopActiveOperationForSignedOutSession()
      .then(async () => {
        await SnapGrokAuth.clearSession();
        await broadcastAuthSnapshot(signedOutSnapshot());
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});

function isTrustedWebsite(sender) {
  try {
    return new URL(sender?.url || "").origin === WEBSITE_ORIGIN;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.target === "service-worker" &&
    message?.type === "SNAPGROK_GET_AUTH_SNAPSHOT"
  ) {
    if (!SnapGrokAuth.isTrustedInternalSender(sender)) {
      sendResponse({ ok: false, error: "AUTH_SNAPSHOT_NOT_ALLOWED" });
      return false;
    }

    SnapGrokAuth.getAuthSnapshot()
      .then((snapshot) => {
        sendResponse({
          ok: true,
          snapshot: publicAuthSnapshot(snapshot),
        });
      })
      .catch(async (error) => {
        trace("AUTH_SNAPSHOT_FAILED", {
          message: String(error?.message || "Unknown authentication error").slice(0, 160),
        });
        const cachedSnapshot = await SnapGrokAuth.getAuthSnapshot({ verify: false })
          .catch(() => null);
        if (cachedSnapshot?.isSignedIn && cachedSnapshot.accountStatus) {
          sendResponse({
            ok: true,
            snapshot: publicAuthSnapshot(cachedSnapshot),
          });
          return;
        }
        sendResponse({ ok: false, error: "AUTH_SNAPSHOT_UNAVAILABLE" });
      });
    return true;
  }

  if (
    message?.target === "service-worker" &&
    message?.type === "SNAPGROK_GET_ACCOUNT_STATUS"
  ) {
    if (!SnapGrokAuth.isTrustedInternalSender(sender)) {
      sendResponse({ ok: false, error: "ACCOUNT_STATUS_NOT_ALLOWED" });
      return false;
    }

    SnapGrokAuth.getAccountStatus()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => {
        trace("ACCOUNT_STATUS_FAILED", {
          code: String(error?.code || "ACCOUNT_STATUS_UNAVAILABLE").slice(0, 64),
        });
        sendResponse({
          ok: false,
          error: String(error?.code || "ACCOUNT_STATUS_UNAVAILABLE").slice(0, 64),
        });
      });
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

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreRuntimeState();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(PROCESSING_ALARM_PREFIX)) {
    const operationId = alarm.name.slice(PROCESSING_ALARM_PREFIX.length);
    void failExpiredProcessingOperation(operationId);
    return;
  }
  if (alarm.name.startsWith(JOB_POLL_ALARM_PREFIX)) {
    const operationId = alarm.name.slice(JOB_POLL_ALARM_PREFIX.length);
    void pollAnalysisJob(operationId);
  }
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
  // Diagnostics deliberately exclude screenshots, instructions, URLs, model
  // output, and answers.
  console.debug(`[Zenaian V5] ${eventName}`, details);
}

async function broadcastAuthSnapshot(snapshot) {
  await chrome.runtime.sendMessage({
    type: "SNAPGROK_AUTH_STATE_CHANGED",
    snapshot: publicAuthSnapshot(snapshot),
  }).catch(() => undefined);
}

function publicAuthSnapshot(snapshot) {
  return {
    isSignedIn: snapshot.isSignedIn,
    deviceSessionPresent: snapshot.deviceSessionPresent,
    email: snapshot.email,
    displayName: snapshot.displayName,
    accountStatus: snapshot.accountStatus || null,
  };
}

function signedOutSnapshot() {
  return {
    isSignedIn: false,
    deviceSessionPresent: false,
    accountId: "",
    email: "",
    displayName: "",
    accountStatus: null,
  };
}

async function stopActiveOperationForSignedOutSession() {
  const operation = await getOperation();
  if (!operation || operation.phase === "result") return;

  if (operation.phase === "selecting" && Number.isInteger(operation.tabId)) {
    await Promise.all(
      [
        "SNAPGROK_STOP_ZONE_SELECTOR_V512",
        "SNAPGROK_STOP_ZONE_SELECTOR",
      ].map((type) =>
        chrome.tabs
          .sendMessage(operation.tabId, {
            type,
            operationId: operation.id,
          })
          .catch(() => undefined),
      ),
    );
  }

  await cancelAnalysisJob(operation).catch(() => undefined);
  await clearProcessingAlarm(operation.id);
  await displayOutcome(
    operation.id,
    errorOutcome(),
    new Error("Your Zenaian session ended. Sign in again before capturing another question."),
  );
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

  const authToken = await SnapGrokAuth.getAccessToken();
  if (!authToken) {
    throw new Error("Sign in to Zenaian from the extension popup before capturing a question.");
  }

  const settings = await SnapGrokSettings.getSettings();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (command === COMMAND_ZONE && isBrowserRestrictedPage(tab?.url)) {
    throw new Error(
      "Chrome blocks selected-area capture on browser-owned pages. Use full-screen capture instead.",
    );
  }

  const operation = await beginOperation(command, tab);

  try {
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
      await setProcessingIndicator(operation.id);

      trace("FULL_CAPTURE_COMPLETED", { operationId: shortId(operation.id) });
      await analyzeAndDisplay(operation.id, imageDataUrl, settings.instruction, authToken);
      return;
    }

    await chrome.action.setTitle({ title: "Zenaian: drag to select a screenshot area" });
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
    // Version the control handshake so an already-open tab cannot answer with
    // a stale selector listener left behind by an earlier extension build.
    type: "SNAPGROK_START_ZONE_SELECTOR_V512",
    operationId,
  };

  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) throw new Error(response?.error || "The selector did not initialize.");
    return;
  } catch (firstError) {
    trace("ZONE_LISTENER_FALLBACK_INJECTION", { operationId: shortId(operationId) });

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["zone-selector.js"],
      });
    } catch (injectionError) {
      if (isBrowserInjectionRestriction(injectionError)) {
        throw new Error(
          "Chrome does not allow selected-area capture on this page. Use full-screen capture instead.",
        );
      }
      throw injectionError;
    }

    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      throw new Error(
        response?.error || firstError?.message || "The selector did not initialize.",
      );
    }
  }
}

function isBrowserRestrictedPage(rawUrl) {
  const value = String(rawUrl || "").trim().toLowerCase();
  if (!value) return false;

  if (
    /^(?:chrome|chrome-extension|chrome-search|chrome-untrusted|devtools|edge|about):/.test(
      value,
    )
  ) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.hostname === "chromewebstore.google.com" ||
      (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"))
    );
  } catch {
    return false;
  }
}

function isBrowserInjectionRestriction(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("cannot access a chrome://") ||
    message.includes("cannot access a chrome-extension://") ||
    message.includes("the extensions gallery cannot be scripted") ||
    message.includes("missing host permission for the tab")
  );
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
    await setProcessingIndicator(operation.id);
    trace("ZONE_CAPTURE_COMPLETED", { operationId: shortId(operation.id) });

    const settings = await SnapGrokSettings.getSettings();
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
    const authToken = existingAuthToken || await SnapGrokAuth.getAccessToken();
    if (!authToken) {
      throw new Error("Your Zenaian session expired. Open the extension and sign in again.");
    }

    const response = await SnapGrokAuth.fetchWithAuth("/api/analyze-jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        operationId,
        imageDataUrl,
        instruction: SnapGrokProtocol.buildInstruction(userInstruction),
        maxWords: MAX_WORDS,
      }),
    });
    const payload = await readApiPayload(response);
    if (!response.ok || !payload?.ok || !isUuid(payload.jobId)) {
      throw apiResponseError(response.status, payload);
    }

    await updateOperation(operationId, {
      jobId: payload.jobId,
      pollAfterMs: normalizePollDelay(payload.pollAfterMs),
    });
    trace("ANALYSIS_JOB_ACCEPTED", {
      operationId: shortId(operationId),
      jobId: shortId(payload.jobId),
    });
    await pollAnalysisJob(operationId);
  } catch (error) {
    await clearProcessingAlarm(operationId);
    await displayOutcome(operationId, errorOutcome(), error);
  }
}

async function pollAnalysisJob(operationId) {
  if (activeJobPolls.has(operationId)) return;
  activeJobPolls.add(operationId);
  try {
    const operation = await getOperation();
    if (
      !operation ||
      operation.id !== operationId ||
      operation.phase !== "processing" ||
      !isUuid(operation.jobId)
    ) {
      await clearJobPollAlarm(operationId);
      return;
    }

    const response = await SnapGrokAuth.fetchWithAuth(
      `/api/analyze-jobs/${encodeURIComponent(operation.jobId)}/poll`,
      { method: "POST", body: "{}" },
    );
    const payload = await readApiPayload(response);
    if (response.status === 202 && payload?.status === "processing") {
      const pollAfterMs = normalizePollDelay(payload.pollAfterMs || operation.pollAfterMs);
      await updateOperation(operationId, { pollAfterMs });
      await scheduleJobPoll(operationId, pollAfterMs);
      return;
    }
    if (!response.ok || !payload?.ok) {
      throw apiResponseError(response.status, payload);
    }

    await clearJobPollAlarm(operationId);
    const outcome = SnapGrokProtocol.parseBackendPayload(payload);
    if (!outcome) {
      const responseShape = payload && typeof payload === "object"
        ? Object.keys(payload).slice(0, 12).join(", ")
        : typeof payload;
      throw new Error(
        `The AI response format could not be parsed. Backend fields: ${responseShape || "none"}.`,
      );
    }
    trace("SERVER_RESULT_RECEIVED", {
      operationId: shortId(operationId),
      resultType: outcome.status,
      answerCount: outcome.answers?.length || 0,
    });
    await displayOutcome(operationId, outcome);
  } catch (error) {
    await clearJobPollAlarm(operationId);
    await displayOutcome(operationId, errorOutcome(), error);
  } finally {
    activeJobPolls.delete(operationId);
  }
}

async function scheduleJobPoll(operationId, delayMs) {
  const when = Date.now() + normalizePollDelay(delayMs);
  await chrome.alarms.create(`${JOB_POLL_ALARM_PREFIX}${operationId}`, { when });
}

async function clearJobPollAlarm(operationId) {
  await chrome.alarms.clear(`${JOB_POLL_ALARM_PREFIX}${operationId}`);
}

async function cancelAnalysisJob(operation) {
  if (!operation?.id) return;
  await clearJobPollAlarm(operation.id);
  if (!isUuid(operation.jobId)) return;
  const response = await SnapGrokAuth.fetchWithAuth(
    `/api/analyze-jobs/${encodeURIComponent(operation.jobId)}/cancel`,
    { method: "POST", body: "{}" },
  );
  await response.arrayBuffer().catch(() => undefined);
}

async function readApiPayload(response) {
  return response.json().catch(() => ({}));
}

function apiResponseError(status, payload) {
  const message =
    status < 500 && typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim().slice(0, 240)
      : "The Zenaian service is temporarily unavailable.";
  const error = new Error(message);
  error.status = status;
  error.code = String(payload?.code || "REQUEST_FAILED");
  return error;
}

function normalizePollDelay(value) {
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds)
    ? Math.min(5000, Math.max(500, Math.round(milliseconds)))
    : 750;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
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

  await cancelAnalysisJob(operation).catch(() => undefined);
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
      `[Zenaian V5] ${error?.name || "Error"}: ${error?.message || "Unknown error"}`,
    );
  }

  await clearProcessingAlarm(operationId);
  await clearJobPollAlarm(operationId);

  const displayDurationMs = resultDisplayDuration(outcome);
  const resetAt = Date.now() + displayDurationMs;
  const errorTitle = error
    ? titleForSystemError(error.message, displayDurationMs)
    : "";
  const iconState = { operationId, outcome, errorTitle, resetAt };

  if (resetTimerId !== null) clearTimeout(resetTimerId);

  await applyOutcomeVisual(outcome, errorTitle);
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
  }, displayDurationMs);
}

async function applyOutcomeVisual(outcome, errorTitle = "") {
  await chrome.action.setIcon({ path: iconForOutcome(outcome) });
  await chrome.action.setTitle({
    title: errorTitle || titleForOutcome(outcome),
  });
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
  if (outcome.status === "inconclusive") {
    return ACTION_TITLES.inconclusive;
  }

  if (outcome.status === "error") {
    return "Zenaian system error";
  }

  if (outcome.answers.length === 1) {
    return `AI-generated answer: ${outcome.answers[0]}`;
  }

  return `AI-generated answers: ${outcome.answers.join(", ")}`;
}

function resultDisplayDuration(outcome) {
  return outcome.status === "answer" && outcome.answers.length > 1
    ? MULTIPLE_RESULT_DISPLAY_MS
    : STANDARD_RESULT_DISPLAY_MS;
}

function titleForSystemError(message, displayDurationMs) {
  const safeMessage = String(message || "The request could not be completed.")
    .replace(/^\[[A-Z0-9_; -]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return `Zenaian: ${safeMessage} · resets in ${displayDurationMs / 1000} seconds`;
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

async function setProcessingIndicator(operationId) {
  const operation = await getOperation();
  if (!operation || operation.id !== operationId || operation.phase !== "processing") return;

  await chrome.action.setIcon({ path: ICONS.processing });
  await chrome.action.setTitle({ title: ACTION_TITLES.processing });
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
  await clearJobPollAlarm(operationId);
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

    await applyOutcomeVisual(
      normalizeOutcome(iconState.outcome),
      typeof iconState.errorTitle === "string" ? iconState.errorTitle : "",
    );
    scheduleRemainingReset(operation.id, iconState.resetAt - now);
    return true;
  }

  if (!operation) return false;

  if (operation.expiresAt <= now) {
    await cancelAnalysisJob(operation).catch(() => undefined);
    await displayOutcome(
      operation.id,
      errorOutcome(),
      new Error("A previous operation expired before completion."),
    );
    return true;
  }

  if (operation.phase === "processing" || operation.phase === "capturing") {
    await chrome.action.setIcon({ path: ICONS.processing });
    if (operation.phase === "processing" && isUuid(operation.jobId)) {
      void pollAnalysisJob(operation.id);
    }
    await chrome.action.setTitle({ title: ACTION_TITLES.processing });
    return true;
  }

  if (operation.phase === "selecting") {
    await chrome.action.setTitle({ title: "Zenaian: drag to select a screenshot area" });
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
      if (operation.phase === "processing" && isUuid(operation.jobId)) {
        void pollAnalysisJob(operation.id);
      }
      await chrome.action.setTitle({ title: ACTION_TITLES.processing });
      return;
    }

    if (operation?.phase === "selecting" && operation.expiresAt > now) {
      await chrome.action.setTitle({ title: "Zenaian: drag to select a screenshot area" });
      return;
    }

    if (operation?.expiresAt <= now) {
      await cancelAnalysisJob(operation).catch(() => undefined);
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
  await chrome.action.setTitle({ title: ACTION_TITLES.idle });
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
