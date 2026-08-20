"use strict";

const elements = {
  accountAvailability: document.querySelector("#accountAvailability"),
  accountDivider: document.querySelector("#accountDivider"),
  accountEmail: document.querySelector("#accountEmail"),
  accountPlan: document.querySelector("#accountPlan"),
  accountStrip: document.querySelector("#accountStrip"),
  assignFull: document.querySelector("#assignFull"),
  assignZone: document.querySelector("#assignZone"),
  authLoading: document.querySelector("#authLoading"),
  fullShortcut: document.querySelector("#fullShortcut"),
  fullShortcutNote: document.querySelector("#fullShortcutNote"),
  manageAccount: document.querySelector("#manageAccount"),
  signIn: document.querySelector("#signIn"),
  signedInView: document.querySelector("#signedInView"),
  signedOutView: document.querySelector("#signedOutView"),
  zoneShortcut: document.querySelector("#zoneShortcut"),
  editInstruction: document.querySelector("#editInstruction"),
  profileButton: document.querySelector("#manageAccount"),
  message: document.querySelector("#message"),
};

let settingsInitialized = false;
let accountStatusInitialized = false;

elements.assignFull.addEventListener("click", openShortcutManager);
elements.assignZone.addEventListener("click", openShortcutManager);
elements.editInstruction.addEventListener("click", openInstructionEditor);
elements.signIn.addEventListener("click", () => openWebsite("/account?mode=sign-in&source=extension"));
elements.manageAccount.addEventListener("click", () => openWebsite("/account"));

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "SNAPGROK_AUTH_STATE_CHANGED" || !message.snapshot) return false;
  void renderAuth(message.snapshot).catch(showError);
  return false;
});

initializeAuth().catch(showError);

async function initializeAuth() {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await chrome.runtime.sendMessage({
        target: "service-worker",
        type: "SNAPGROK_GET_AUTH_SNAPSHOT",
      });
      if (!response?.ok || !response.snapshot) {
        const diagnosticCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(
          String(response?.error || ""),
        )
          ? ` (${response.error})`
          : "";
        throw new Error(`Zenaian account status is unavailable${diagnosticCode}.`);
      }
      await renderAuth(response.snapshot);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(150 * (attempt + 1));
    }
  }

  throw lastError || new Error("Zenaian account status is unavailable.");
}

async function renderAuth(snapshot) {
  elements.message.textContent = "";
  elements.authLoading.hidden = true;
  elements.accountDivider.hidden = !snapshot.isSignedIn;
  elements.accountStrip.hidden = !snapshot.isSignedIn;
  elements.profileButton.hidden = !snapshot.isSignedIn;
  elements.signedInView.hidden = !snapshot.isSignedIn;
  elements.signedOutView.hidden = snapshot.isSignedIn;

  if (!snapshot.isSignedIn) {
    settingsInitialized = false;
    accountStatusInitialized = false;
    return;
  }

  elements.accountEmail.textContent = snapshot.email || snapshot.displayName;
  if (!accountStatusInitialized) {
    accountStatusInitialized = true;
    elements.accountPlan.textContent = "Plan";
    elements.accountAvailability.textContent = "Checking availability…";
    void initializeAccountStatus();
  }
  if (!settingsInitialized) {
    settingsInitialized = true;
    await initializeSettings();
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function initializeSettings() {
  const commands = await chrome.commands.getAll();

  const commandMap = new Map(commands.map((command) => [command.name, command.shortcut || ""]));
  const fullShortcut = commandMap.get("capture-full-screen") || "";
  const zoneShortcut = commandMap.get("capture-selected-zone") || "";
  const fullShortcutUnavailable = !fullShortcut;

  elements.fullShortcut.textContent = compactShortcut(fullShortcut);
  elements.zoneShortcut.textContent = compactShortcut(zoneShortcut);
  elements.fullShortcutNote.hidden = !fullShortcutUnavailable;
  elements.assignFull.textContent = fullShortcutUnavailable ? "Assign" : "Change";
}

async function initializeAccountStatus() {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await chrome.runtime.sendMessage({
        target: "service-worker",
        type: "SNAPGROK_GET_ACCOUNT_STATUS",
      });
      if (!response?.ok || !response.status) {
        throw new Error("Zenaian question availability is unavailable.");
      }
      renderAccountStatus(response.status);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(200 * (attempt + 1));
    }
  }

  console.error(lastError);
  elements.accountPlan.textContent = "Plan";
  elements.accountAvailability.textContent = "Availability unavailable";
}

function renderAccountStatus(status) {
  const allowance = status.allowance;
  const remaining = status.remaining;
  const hasUsage = Number.isSafeInteger(allowance) && allowance >= 0 &&
    Number.isSafeInteger(remaining) && remaining >= 0 && remaining <= allowance;

  elements.accountPlan.textContent = planLabel(status.planId);
  elements.accountAvailability.textContent = hasUsage
    ? `${remaining} of ${allowance} Available`
    : "Availability unavailable";
}

function planLabel(planId) {
  return {
    free: "Free",
    plus: "Plus",
    ultra: "Ultra",
  }[String(planId || "").toLowerCase()] || "Plan";
}

function compactShortcut(value) {
  return String(value || "Not assigned")
    .replace(/Command/gi, "⌘")
    .replace(/Ctrl/gi, "Ctrl")
    .replace(/Shift/gi, "Shift");
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
  elements.accountDivider.hidden = true;
  elements.accountStrip.hidden = true;
  elements.profileButton.hidden = true;
  elements.signedInView.hidden = true;
  elements.signedOutView.hidden = false;
  elements.message.textContent = "Account status could not be loaded. Please reopen Zenaian and try again.";
}
