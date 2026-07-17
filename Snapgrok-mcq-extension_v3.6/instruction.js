"use strict";

const instructionInput = document.querySelector("#instruction");
const message = document.querySelector("#message");

initialize().catch((error) => showMessage(error?.message || "Unable to load the instruction.", true));

document.querySelector("#cancel").addEventListener("click", () => window.close());
document.querySelector("#save").addEventListener("click", save);

async function initialize() {
  const settings = await SnapGrokSettings.getSettings();
  instructionInput.value = settings.instruction;
  instructionInput.focus();
}

async function save() {
  const instruction = instructionInput.value.trim();
  if (!instruction) {
    showMessage("Add an instruction before saving.", true);
    return;
  }

  await SnapGrokSettings.saveInstruction(instruction);
  showMessage("Saved.");
  setTimeout(() => window.close(), 300);
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#9f2020" : "#276a31";
}
