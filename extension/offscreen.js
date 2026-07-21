"use strict";

let activeRequest = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }

  if (message?.type === "SNAPGROK_OFFSCREEN_ABORT_ANALYSIS") {
    if (activeRequest && (!message.operationId || activeRequest.operationId === message.operationId)) {
      activeRequest.abortReason = typeof message.reason === "string" ? message.reason : "The request was cancelled.";
      activeRequest.controller.abort();
      sendResponse({ aborted: true });
    } else {
      sendResponse({ aborted: false });
    }
    return false;
  }

  if (message?.type !== "SNAPGROK_OFFSCREEN_START_ANALYSIS") return false;

  if (activeRequest) {
    sendResponse({ accepted: false, error: "A background analysis request is already active." });
    return false;
  }

  const operationId = typeof message.operationId === "string" ? message.operationId : "";
  const serverUrl = typeof message.serverUrl === "string" ? message.serverUrl.replace(/\/$/, "") : "";
  const authToken = typeof message.authToken === "string" ? message.authToken : "";
  const timeoutMs = Math.min(Math.max(Number(message.timeoutMs) || 120000, 30000), 180000);
  const requestBody = message.requestBody;

  if (!operationId || !serverUrl || !authToken || !requestBody || typeof requestBody !== "object") {
    sendResponse({ accepted: false, error: "The background analysis request was invalid." });
    return false;
  }

  sendResponse({ accepted: true });
  void runAnalysis({ operationId, serverUrl, authToken, timeoutMs, requestBody });
  return false;
});

async function runAnalysis({ operationId, serverUrl, authToken, timeoutMs, requestBody }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  activeRequest = { operationId, controller, authToken, abortReason: "" };

  try {
    const payload = await fetchAnalysisWithAuthRetry({
      serverUrl,
      authToken,
      requestBody,
      signal: controller.signal,
    });

    await chrome.runtime.sendMessage({
      type: "SNAPGROK_OFFSCREEN_ANALYSIS_COMPLETE",
      operationId,
      ok: true,
      payload,
    });
  } catch (error) {
    const errorMessage = error?.name === "AbortError"
      ? activeRequest?.abortReason || "The server request exceeded the 120-second processing limit."
      : error?.message || "The server request failed.";

    await chrome.runtime.sendMessage({
      type: "SNAPGROK_OFFSCREEN_ANALYSIS_COMPLETE",
      operationId,
      ok: false,
      error: errorMessage,
    });
  } finally {
    clearTimeout(timeoutId);

    if (requestBody && typeof requestBody === "object") {
      requestBody.imageDataUrl = "";
      requestBody.instruction = "";
    }

    if (activeRequest) activeRequest.authToken = "";

    activeRequest = null;
  }
}

async function fetchAnalysisWithAuthRetry({ serverUrl, authToken, requestBody, signal }) {
  let currentToken = authToken;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${serverUrl}/api/analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal,
      body: JSON.stringify(requestBody),
    });

    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;

    if (response.status === 401 && attempt === 0) {
      const refreshed = await requestFreshSessionToken();
      if (refreshed) {
        currentToken = refreshed;
        if (activeRequest) activeRequest.authToken = refreshed;
        continue;
      }
    }

    const message = response.status === 401
      ? "Your SnapGrok session is no longer active. Open the extension and sign in again."
      : payload.error || `Backend returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload.code || "REQUEST_FAILED";
    throw error;
  }

  throw new Error("Your SnapGrok session is no longer active. Open the extension and sign in again.");
}

async function requestFreshSessionToken() {
  const response = await chrome.runtime.sendMessage({
    target: "service-worker",
    type: "SNAPGROK_GET_FRESH_SESSION_TOKEN",
  });
  return response?.ok && typeof response.token === "string" ? response.token : "";
}
