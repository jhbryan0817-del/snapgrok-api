"use strict";

const elements = {
  accountEmail: document.querySelector("#accountEmail"),
  assignFull: document.querySelector("#assignFull"),
  assignZone: document.querySelector("#assignZone"),
  authLoading: document.querySelector("#authLoading"),
  authStatus: document.querySelector("#authStatus"),
  fullShortcut: document.querySelector("#fullShortcut"),
  manageAccount: document.querySelector("#manageAccount"),
  signIn: document.querySelector("#signIn"),
  signedInView: document.querySelector("#signedInView"),
  signedOutView: document.querySelector("#signedOutView"),
  zoneShortcut: document.querySelector("#zoneShortcut"),
  editInstruction: document.querySelector("#editInstruction"),
  instructionPreview: document.querySelector("#instructionPreview"),
  message: document.querySelector("#message"),
};

let settingsInitialized = false;

elements.assignFull.addEventListener("click", openShortcutManager);
elements.assignZone.addEventListener("click", openShortcutManager);
elements.editInstruction.addEventListener("click", openInstructionEditor);
elements.signIn.addEventListener("click", () => openWebsite("/sign-in?source=extension"));
elements.manageAccount.addEventListener("click", () => openWebsite("/account"));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SnapGrokSettings.STORAGE_KEY]) return;
  const settings = SnapGrokSettings.normalizeSettings(changes[SnapGrokSettings.STORAGE_KEY].newValue);
  renderInstruction(settings.instruction);
});

initializeAuth().catch(showError);

async function initializeAuth() {
  const response = await chrome.runtime.sendMessage({
    target: "service-worker",
    type: "SNAPGROK_GET_AUTH_SNAPSHOT",
  });
  if (!response?.ok || !response.snapshot) {
    throw new Error("SnapGrok account status is unavailable.");
  }
  await renderAuth(response.snapshot);
}

async function renderAuth(snapshot) {
  elements.authLoading.hidden = true;
  elements.signedInView.hidden = !snapshot.isSignedIn;
  elements.signedOutView.hidden = snapshot.isSignedIn;
  elements.authStatus.classList.toggle("checking", false);
  elements.authStatus.classList.toggle("signed-out", !snapshot.isSignedIn);
  elements.authStatus.innerHTML = snapshot.isSignedIn
    ? "<span></span>Ready"
    : "<span></span>Sign in";

  if (!snapshot.isSignedIn) {
    settingsInitialized = false;
    return;
  }

  elements.accountEmail.textContent = snapshot.email || snapshot.displayName;
  if (!settingsInitialized) {
    settingsInitialized = true;
    await initializeSettings();
  }
}

async function initializeSettings() {
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

async function openWebsite(pathname) {
  const url = new URL(pathname, `${SnapGrokAuthConfig.websiteUrl}/`);
  await chrome.tabs.create({ url: url.href });
  window.close();
}

function showError(error) {
  console.error(error);
  elements.authLoading.hidden = true;
  elements.signedInView.hidden = true;
  elements.signedOutView.hidden = false;
  elements.authStatus.classList.remove("checking");
  elements.authStatus.classList.add("signed-out");
  elements.authStatus.innerHTML = "<span></span>Unavailable";
  elements.message.textContent = "Account status could not be loaded. Please reopen SnapGrok and try again.";
}
