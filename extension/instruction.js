"use strict";

const instructionInput = document.querySelector("#instruction");
const message = document.querySelector("#message");
const counter = document.querySelector("#counter");

initialize().catch((error) => showMessage(error?.message || "Unable to load the instruction.", true));

document.querySelector("#cancel").addEventListener("click", () => window.close());
document.querySelector("#save").addEventListener("click", save);
instructionInput.addEventListener("input", updateCounter);

async function initialize() {
  const settings = await SnapGrokSettings.getSettings();
  instructionInput.value = settings.instruction;
  updateCounter();
  instructionInput.focus();
}

async function save() {
  const instruction = instructionInput.value.trim();
  await SnapGrokSettings.saveInstruction(instruction);
  showMessage(
    instruction
      ? "Custom context saved."
      : "Custom context cleared. Zenaian will use its default instruction.",
  );
  setTimeout(() => window.close(), 350);
}

function updateCounter() {
  counter.textContent = `${instructionInput.value.length.toLocaleString()} / 12,000`;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#b42318" : "#287a3f";
}
