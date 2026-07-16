const elements = {
  slotList: document.querySelector("#slotList"),
  balanceValue: document.querySelector("#balanceValue"),
  refreshBalance: document.querySelector("#refreshBalance"),
  pauseResume: document.querySelector("#pauseResume"),
  statusText: document.querySelector("#statusText"),
  message: document.querySelector("#message"),
};

let settings;
let commandMap = new Map();

initialize().catch(showFatalError);

async function initialize() {
  [settings] = await Promise.all([SnapGrok.getSettings(), loadCommands()]);
  renderSlots();
  updatePauseState();
  bindEvents();
  await refreshBalance();
}

async function loadCommands() {
  const commands = await chrome.commands.getAll();
  commandMap = new Map(commands.map((command) => [command.name, command.shortcut || "Not assigned"]));
}

function renderSlots() {
  elements.slotList.replaceChildren();

  settings.slots.forEach((slot, index) => {
    const row = document.createElement("article");
    row.className = "slot-row";

    const shortcut = document.createElement("button");
    shortcut.type = "button";
    shortcut.className = "shortcut-button";
    const assignedKey = commandMap.get(`run-shortcut-${index + 1}`) || "Not assigned";
    shortcut.textContent = assignedKey;
    shortcut.title = "Click to change this shortcut in Chrome's shortcut manager.";
    if (assignedKey === "Not assigned") shortcut.classList.add("unassigned");
    shortcut.addEventListener("click", openShortcutManager);

    const instruction = document.createElement("button");
    instruction.type = "button";
    instruction.className = "instruction-button";

    if (!slot.name && !slot.instruction) {
      instruction.classList.add("empty");
      instruction.innerHTML = '<span class="slot-title">Add name &amp; instruction</span>';
    } else {
      instruction.innerHTML = `
        <span class="slot-title">${escapeHtml(slot.name || `Shortcut ${index + 1}`)}</span>
        <span class="slot-summary">${escapeHtml(slot.instruction || "Add an instruction")}</span>
      `;
    }

    instruction.addEventListener("click", () => openInstructionEditor(index));
    row.append(shortcut, instruction);
    elements.slotList.append(row);
  });
}

function bindEvents() {
  elements.refreshBalance.addEventListener("click", refreshBalance);
  elements.pauseResume.addEventListener("click", togglePause);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = SnapGrok.normalizeSettings(changes.settings.newValue);
    renderSlots();
    updatePauseState();
  });
}

async function openInstructionEditor(slotIndex) {
  await chrome.windows.create({
    url: chrome.runtime.getURL(`instruction.html?slot=${slotIndex}`),
    type: "popup",
    width: 640,
    height: 570,
    focused: true,
  });
}

async function openShortcutManager() {
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}

async function togglePause() {
  const messageType = settings.paused ? "RESUME_EXTENSION" : "PAUSE_EXTENSION";
  const response = await chrome.runtime.sendMessage({ type: messageType });

  if (!response?.ok) {
    showMessage(response?.error || "Unable to change extension state.", true);
    return;
  }

  settings = await SnapGrok.getSettings();
  updatePauseState();
  showMessage(settings.paused ? "Extension paused." : "Extension resumed.");
}

function updatePauseState() {
  elements.statusText.textContent = settings.paused ? "Extension paused" : "Extension active";
  elements.statusText.classList.toggle("paused", settings.paused);
  elements.pauseResume.textContent = settings.paused ? "Resume extension" : "Pause extension";
}

async function refreshBalance() {
  elements.balanceValue.textContent = "Loading…";

  try {
    const response = await fetch(`${settings.serverUrl.replace(/\/$/, "")}/api/balance`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Balance request failed.");

    if (!payload.configured) {
      elements.balanceValue.textContent = "Not configured on server";
      return;
    }

    if (Number.isFinite(Number(payload.estimatedOutputTokens))) {
      elements.balanceValue.textContent = `≈ ${Number(payload.estimatedOutputTokens).toLocaleString()} output tokens`;
      return;
    }

    if (Number.isFinite(Number(payload.creditUsd))) {
      elements.balanceValue.textContent = `$${Number(payload.creditUsd).toFixed(2)} prepaid credit`;
      return;
    }

    elements.balanceValue.textContent = "Balance unavailable";
  } catch (error) {
    elements.balanceValue.textContent = "Server unavailable";
    elements.balanceValue.title = error.message;
  }
}

function showMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.style.color = isError ? "#9d2c2c" : "#2d6633";
  setTimeout(() => {
    if (elements.message.textContent === text) elements.message.textContent = "";
  }, 3000);
}

function showFatalError(error) {
  console.error(error);
  elements.slotList.textContent = error.message || "Unable to initialize the extension.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
