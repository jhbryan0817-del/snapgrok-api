const instructionField = document.getElementById("instruction");
const saveButton = document.getElementById("save");
const cancelButton = document.getElementById("cancel");
const status = document.getElementById("status");

saveButton.addEventListener("click", saveInstruction);
cancelButton.addEventListener("click", () => window.close());

initialize().catch((error) => {
  status.textContent = "The instruction could not be loaded.";
  console.error(`[SnapGrok instruction] ${error?.message || "Load failed."}`);
});

async function initialize() {
  const settings = await SnapGrokV34.getSettings();
  instructionField.value = settings.instruction;
  instructionField.focus();
}

async function saveInstruction() {
  saveButton.disabled = true;
  try {
    await SnapGrokV34.saveSettings({
      instruction: instructionField.value,
    });
    status.textContent = "Saved.";
    setTimeout(() => window.close(), 250);
  } catch (error) {
    status.textContent = "The instruction could not be saved.";
    console.error(`[SnapGrok instruction] ${error?.message || "Save failed."}`);
    saveButton.disabled = false;
  }
}
