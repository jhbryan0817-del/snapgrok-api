const fullShortcutButton = document.getElementById("fullShortcut");
const zoneShortcutButton = document.getElementById("zoneShortcut");
const instructionButton = document.getElementById("instructionButton");
const instructionText = document.getElementById("instructionText");

fullShortcutButton.addEventListener("click", openShortcutSettings);
zoneShortcutButton.addEventListener("click", openShortcutSettings);
instructionButton.addEventListener("click", openInstructionEditor);

initialize().catch((error) => {
  console.error(`[SnapGrok popup] ${error?.message || "Initialization failed."}`);
});

async function initialize() {
  const [commands, settings] = await Promise.all([
    chrome.commands.getAll(),
    SnapGrokV34.getSettings(),
  ]);

  renderShortcut(
    fullShortcutButton,
    commands.find((command) => command.name === "capture-full-screen")?.shortcut,
  );
  renderShortcut(
    zoneShortcutButton,
    commands.find((command) => command.name === "capture-selected-zone")?.shortcut,
  );

  const instruction = settings.instruction.trim();
  instructionText.textContent = instruction || "Add Instruction";
  instructionButton.title = instruction || "Add the instruction sent with every screenshot";
}

function renderShortcut(button, shortcut) {
  const assigned = typeof shortcut === "string" && shortcut.trim();
  button.textContent = assigned || "Assign";
  button.classList.toggle("assigned", Boolean(assigned));
}

async function openShortcutSettings() {
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  window.close();
}

async function openInstructionEditor() {
  await chrome.windows.create({
    url: chrome.runtime.getURL("instruction.html"),
    type: "popup",
    width: 500,
    height: 455,
  });
  window.close();
}
