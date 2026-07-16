const fullScreenShortcut = document.getElementById("fullScreenShortcut");
const zoneShortcut = document.getElementById("zoneShortcut");
const instructionButton = document.getElementById("instructionButton");
const instructionPreview = document.getElementById("instructionPreview");

fullScreenShortcut.addEventListener("click", openShortcutSettings);
zoneShortcut.addEventListener("click", openShortcutSettings);
instructionButton.addEventListener("click", openInstructionEditor);
window.addEventListener("focus", refresh);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.settings) refreshInstruction();
});

refresh();

async function refresh() {
  await Promise.all([refreshShortcuts(), refreshInstruction()]);
}

async function refreshShortcuts() {
  const commands = await chrome.commands.getAll();
  const byName = new Map(commands.map((command) => [command.name, command.shortcut]));

  fullScreenShortcut.textContent = byName.get("capture-full-screen") || "Assign";
  zoneShortcut.textContent = byName.get("capture-selected-zone") || "Assign";
}

async function refreshInstruction() {
  const settings = await SnapGrok.getSettings();
  instructionPreview.textContent = settings.instruction || "Add Instruction";
  instructionButton.title = settings.instruction || "Add the instruction sent with every screenshot";
}

async function openShortcutSettings() {
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  window.close();
}

async function openInstructionEditor() {
  await chrome.windows.create({
    url: chrome.runtime.getURL("instruction.html"),
    type: "popup",
    width: 470,
    height: 390,
    focused: true,
  });
  window.close();
}
