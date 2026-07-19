"use strict";

const elements = {
  accountIcon: document.querySelector("#accountIcon"),
  accountHeading: document.querySelector("#accountHeading"),
  accountDescription: document.querySelector("#accountDescription"),
  accountState: document.querySelector("#accountState"),
  signedOutActions: document.querySelector("#signedOutActions"),
  signedInActions: document.querySelector("#signedInActions"),
  signIn: document.querySelector("#signIn"),
  signUp: document.querySelector("#signUp"),
  signOut: document.querySelector("#signOut"),
  manageAccount: document.querySelector("#manageAccount"),
  openDashboard: document.querySelector("#openDashboard"),
  assignFull: document.querySelector("#assignFull"),
  assignZone: document.querySelector("#assignZone"),
  fullShortcut: document.querySelector("#fullShortcut"),
  zoneShortcut: document.querySelector("#zoneShortcut"),
  editInstruction: document.querySelector("#editInstruction"),
  instructionPreview: document.querySelector("#instructionPreview"),
  message: document.querySelector("#message"),
};

initialize().catch(showError);

elements.signIn.addEventListener("click", () => runAction(() => SnapGrokAuthBridge.openSignIn()));
elements.signUp.addEventListener("click", () => runAction(() => SnapGrokAuthBridge.openSignUp()));
elements.manageAccount.addEventListener("click", () => runAction(() => SnapGrokAuthBridge.openDashboard()));
elements.openDashboard.addEventListener("click", () => runAction(() => SnapGrokAuthBridge.openDashboard()));
elements.signOut.addEventListener("click", () => runAction(signOut));
elements.assignFull.addEventListener("click", openShortcutManager);
elements.assignZone.addEventListener("click", openShortcutManager);
elements.editInstruction.addEventListener("click", openInstructionEditor);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SnapGrokSettings.STORAGE_KEY]) return;
  const settings = SnapGrokSettings.normalizeSettings(
    changes[SnapGrokSettings.STORAGE_KEY].newValue,
  );
  renderInstruction(settings.instruction);
});

async function initialize() {
  await Promise.all([renderAccount(), renderShortcuts(), renderStoredInstruction()]);
}

async function renderAccount() {
  const state = await SnapGrokAuthBridge.getState();

  elements.signedOutActions.classList.toggle("hidden", state.signedIn);
  elements.signedInActions.classList.toggle("hidden", !state.signedIn);

  if (state.signedIn) {
    const identity = state.email || state.displayName || "SnapGrok user";
    elements.accountIcon.textContent = identity.slice(0, 1).toUpperCase();
    elements.accountHeading.textContent = identity;
    elements.accountDescription.textContent = "Your SnapGrok account is connected.";
    elements.accountState.textContent = "Signed in";
    elements.accountState.classList.add("connected");
    return;
  }

  elements.accountIcon.textContent = "?";
  elements.accountHeading.textContent = "Sign in to SnapGrok";
  elements.accountDescription.textContent = state.message || "Open the website to sign in.";
  elements.accountState.textContent = state.configured ? "Signed out" : "Setup";
  elements.accountState.classList.remove("connected");
}

async function renderShortcuts() {
  const commands = await chrome.commands.getAll();
  const byName = new Map(commands.map((command) => [command.name, command]));

  elements.fullShortcut.textContent = formatShortcut(
    byName.get("capture-full-screen")?.shortcut,
  );
  elements.zoneShortcut.textContent = formatShortcut(
    byName.get("capture-selected-zone")?.shortcut,
  );
}

function formatShortcut(shortcut) {
  return shortcut && shortcut.trim() ? shortcut : "Not assigned";
}

async function renderStoredInstruction() {
  const settings = await SnapGrokSettings.getSettings();
  renderInstruction(settings.instruction);
}

function renderInstruction(instruction) {
  const cleaned = typeof instruction === "string" ? instruction.trim() : "";
  elements.instructionPreview.textContent = cleaned ||
    "No custom instruction. SnapGrok will use its standard compact MCQ format.";
  elements.instructionPreview.classList.toggle("is-empty", !cleaned);
}

async function openShortcutManager() {
  clearMessage();
  await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}

async function openInstructionEditor() {
  clearMessage();
  await chrome.windows.create({
    url: chrome.runtime.getURL("instruction.html"),
    type: "popup",
    width: 580,
    height: 720,
    focused: true,
  });
}

async function signOut() {
  await SnapGrokAuthBridge.signOut();
  await renderAccount();
}

async function runAction(action) {
  clearMessage();
  try {
    await action();
  } catch (error) {
    showError(error);
  }
}

function clearMessage() {
  elements.message.textContent = "";
  elements.message.className = "message";
}

function showError(error) {
  elements.message.textContent = error instanceof Error
    ? error.message
    : "Something went wrong.";
  elements.message.className = "message error";
}
