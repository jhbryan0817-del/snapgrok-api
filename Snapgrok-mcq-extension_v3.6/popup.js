"use strict";

const elements = {
  assignFull: document.querySelector("#assignFull"),
  assignZone: document.querySelector("#assignZone"),
  fullShortcut: document.querySelector("#fullShortcut"),
  zoneShortcut: document.querySelector("#zoneShortcut"),
  editInstruction: document.querySelector("#editInstruction"),
  instructionTitle: document.querySelector("#instructionTitle"),
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
  elements.fullShortcut.textContent = commandMap.get("capture-full-screen") || "Not assigned";
  elements.zoneShortcut.textContent = commandMap.get("capture-selected-zone") || "Not assigned";
  renderInstruction(settings.instruction);
}

function renderInstruction(instruction) {
  const text = String(instruction || "").trim();
  elements.instructionTitle.textContent = text ? "Instruction" : "Add Instruction";
  elements.instructionPreview.textContent = text;
}

async function openShortcutManager() {
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  window.close();
}

async function openInstructionEditor() {
  await chrome.windows.create({
    url: chrome.runtime.getURL("instruction.html"),
    type: "popup",
    width: 650,
    height: 520,
    focused: true,
  });
  window.close();
}

function showError(error) {
  console.error(error);
  elements.message.textContent = error?.message || "Unable to open SnapGrok settings.";
}
