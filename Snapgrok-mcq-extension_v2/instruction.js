const instructionField = document.getElementById("instruction");
const saveButton = document.getElementById("saveButton");
const cancelButton = document.getElementById("cancelButton");
const status = document.getElementById("status");

saveButton.addEventListener("click", saveInstruction);
cancelButton.addEventListener("click", () => window.close());

initialize();

async function initialize() {
  const settings = await SnapGrok.getSettings();
  instructionField.value = settings.instruction;
  instructionField.focus();
  instructionField.setSelectionRange(instructionField.value.length, instructionField.value.length);
}

async function saveInstruction() {
  const instruction = instructionField.value.trim();
  if (!instruction) {
    status.textContent = "Enter an instruction before saving.";
    instructionField.focus();
    return;
  }

  saveButton.disabled = true;
  status.textContent = "Saving…";

  try {
    await SnapGrok.updateSettings((settings) => {
      settings.instruction = instruction;
      return settings;
    });
    status.textContent = "Saved.";
    setTimeout(() => window.close(), 250);
  } catch {
    status.textContent = "The instruction could not be saved.";
    saveButton.disabled = false;
  }
}
