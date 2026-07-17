"use strict";

const SERVER_URL = "https://snapgrok-api.onrender.com";

const instruction = document.querySelector("#instruction");
const saveButton = document.querySelector("#saveButton");
const saveMessage = document.querySelector("#saveMessage");
const serverDot = document.querySelector("#serverDot");
const serverText = document.querySelector("#serverText");

void initialize();

async function initialize() {
  const settings = await SnapGrokSettings.getSettings();
  instruction.value = settings.instruction;
  saveButton.addEventListener("click", save);
  void checkServer();
}

async function save() {
  saveButton.disabled = true;
  saveMessage.textContent = "Saving…";

  try {
    const settings = await SnapGrokSettings.saveInstruction(instruction.value);
    instruction.value = settings.instruction;
    saveMessage.textContent = "Saved";
    setTimeout(() => {
      saveMessage.textContent = "";
    }, 1800);
  } catch (error) {
    saveMessage.textContent = error?.message || "Could not save";
  } finally {
    saveButton.disabled = false;
  }
}

async function checkServer() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${SERVER_URL}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.ok) throw new Error("Backend unavailable");

    serverDot.className = "server-dot online";
    serverDot.title = "Backend online";
    serverText.textContent = `Backend online · ${payload.model || "Grok"} · structured answers enabled`;
  } catch {
    serverDot.className = "server-dot offline";
    serverDot.title = "Backend offline";
    serverText.textContent = "Backend could not be reached. Render may be waking up or redeploying.";
  } finally {
    clearTimeout(timeout);
  }
}
