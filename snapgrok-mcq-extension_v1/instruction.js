const slotIndex = Number(SnapGrok.queryParameter("slot"));
const nameInput = document.querySelector("#shortcutName");
const instructionInput = document.querySelector("#instruction");
const message = document.querySelector("#message");

initialize().catch((error) => show(error.message, true));

async function initialize() {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) {
    throw new Error("Invalid shortcut slot.");
  }

  const settings = await SnapGrok.getSettings();
  const slot = settings.slots[slotIndex];
  if (!slot) throw new Error("Shortcut slot was not found.");

  nameInput.value = slot.name;
  instructionInput.value = slot.instruction;
  nameInput.focus();
}

document.querySelector("#cancel").addEventListener("click", () => window.close());

document.querySelector("#save").addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const instruction = instructionInput.value.trim();

  if (!name) return show("Add a shortcut name.", true);
  if (!instruction) return show("Add an instruction.", true);

  await SnapGrok.updateSettings((settings) => {
    settings.slots[slotIndex].name = name;
    settings.slots[slotIndex].instruction = instruction;
    return settings;
  });

  show("Saved.");
  setTimeout(() => window.close(), 350);
});

function show(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#9f2020" : "#276a31";
}
