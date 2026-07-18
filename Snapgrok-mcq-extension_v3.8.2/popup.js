"use strict";

const elements = {
  assignFull: document.querySelector("#assignFull"),
  assignZone: document.querySelector("#assignZone"),
  fullShortcut: document.querySelector("#fullShortcut"),
  zoneShortcut: document.querySelector("#zoneShortcut"),
  editInstruction: document.querySelector("#editInstruction"),
  instructionPreview: document.querySelector("#instructionPreview"),
  message: document.querySelector("#message"),
};

initialize().catch(showError);

elements.assignFull.addEventListener("click", openShortcutManager);
elements.assignZone.addEventListener("click", openShortcutManager);
elements.editInstruction.addEventListener("click", openInstructionEditor);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SnapGrokSettings.STORAGE_KEY]) return;
  const settings = SnapGrokSettings.normalizeSettings(changes[SnapGrokSettings.STORAGE_KEY].newValue);
  renderInstruction(settings.instruction);
});

async function initialize() {
  const [settings, commands] = await Promise.all([
    SnapGrokSettings.getSettings(),
    chrome.commands.getAll(),
  ]);

  const commandMap = new Map(commands.map((command) => [command.name, command.shortcut || "Not assigned"]));
  elements.fullShortcut.textContent = compactShortcut(commandMap.get("capture-full-screen"));
  elements.zoneShortcut.textContent = compactShortcut(commandMap.get("capture-selected-zone"));
  renderInstruction(settings.instruction);
}

function compactShortcut(value) {
  return String(value || "Not assigned")
    .replace(/Command/gi, "⌘")
    .replace(/Ctrl/gi, "Ctrl")
    .replace(/Shift/gi, "Shift");
}

function renderInstruction(instruction) {
  const text = String(instruction || "").trim();
  elements.instructionPreview.textContent = text || "No instruction saved yet. Add the context you want applied to every screenshot.";
  elements.instructionPreview.classList.toggle("empty", !text);
}

async function openShortcutManager() {
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  window.close();
}

async function openInstructionEditor() {
  await chrome.windows.create({
    url: chrome.runtime.getURL("instruction.html"),
    type: "popup",
    width: 680,
    height: 600,
    focused: true,
  });
  window.close();
}

function showError(error) {
  console.error(error);
  elements.message.textContent = error?.message || "Unable to open SnapGrok settings.";
}
