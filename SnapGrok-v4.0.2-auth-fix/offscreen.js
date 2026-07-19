"use strict";

let activeRequest = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message?.type !== "SNAPGROK_OFFSCREEN_START_ANALYSIS") {
    return false;
  }

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
  activeRequest = { operationId, controller, authToken };

  try {
    const response = await fetch(`${serverUrl}/api/analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Backend returned HTTP ${response.status}.`);
    }

    await chrome.runtime.sendMessage({
      type: "SNAPGROK_OFFSCREEN_ANALYSIS_COMPLETE",
      operationId,
      ok: true,
      payload,
    });
  } catch (error) {
    const errorMessage = error?.name === "AbortError"
      ? "The server request exceeded the 120-second processing limit."
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
