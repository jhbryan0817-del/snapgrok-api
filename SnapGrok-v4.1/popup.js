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
let authRefreshGeneration = 0;
let hasRenderedAuth = false;
let pollInProgress = false;

const AUTH_POLL_MS = 1200;
const AUTH_RETRY_DELAYS_MS = [0, 120, 220, 400, 650, 900];

setupEventListeners();
initializeAuth().catch(showError);

const authPollId = setInterval(() => {
  if (document.hidden || pollInProgress) return;
  void refreshAuth({ silent: true, delays: [0, 180] });
}, AUTH_POLL_MS);

window.addEventListener("unload", () => clearInterval(authPollId), { once: true });

function setupEventListeners() {
  elements.assignFull.addEventListener("click", openShortcutManager);
  elements.assignZone.addEventListener("click", openShortcutManager);
  elements.editInstruction.addEventListener("click", openInstructionEditor);
  elements.signIn.addEventListener("click", () => openWebsite("/sign-in?source=extension"));
  elements.manageAccount.addEventListener("click", () => openWebsite("/account"));

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SnapGrokSettings.STORAGE_KEY]) return;
    const settings = SnapGrokSettings.normalizeSettings(
      changes[SnapGrokSettings.STORAGE_KEY].newValue,
    );
    renderInstruction(settings.instruction);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "SNAPGROK_AUTH_STATE_CHANGED") return false;
    if (message.snapshot) {
      void renderAuth(message.snapshot).catch(showError);
    } else {
      void refreshAuth({ silent: false, delays: AUTH_RETRY_DELAYS_MS });
    }
    return false;
  });

  window.addEventListener("focus", () => {
    void refreshAuth({ silent: true, delays: [0, 120, 250] });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refreshAuth({ silent: true, delays: [0, 120, 250] });
  });
}

async function initializeAuth() {
  await refreshAuth({ silent: false, delays: AUTH_RETRY_DELAYS_MS });
}

async function refreshAuth({ silent, delays }) {
  const generation = ++authRefreshGeneration;
  pollInProgress = true;

  if (!silent && !hasRenderedAuth) showChecking();

  let lastError = null;

  try {
    for (const waitMs of delays) {
      if (waitMs) await delay(waitMs);
      if (generation !== authRefreshGeneration) return;

      try {
        const response = await chrome.runtime.sendMessage({
          target: "service-worker",
          type: "SNAPGROK_GET_AUTH_SNAPSHOT",
        });

        if (!response?.ok || !response.snapshot) {
          throw new Error(response?.error || "AUTH_SNAPSHOT_UNAVAILABLE");
        }

        if (generation !== authRefreshGeneration) return;
        await renderAuth(response.snapshot);
        hasRenderedAuth = true;
        elements.message.textContent = "";
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (!silent || !hasRenderedAuth) throw lastError || new Error("AUTH_SNAPSHOT_UNAVAILABLE");
  } finally {
    if (generation === authRefreshGeneration) pollInProgress = false;
  }
}

async function renderAuth(snapshot) {
  elements.authLoading.hidden = true;
  elements.signedInView.hidden = !snapshot.isSignedIn;
  elements.signedOutView.hidden = snapshot.isSignedIn;
  elements.authStatus.classList.toggle("checking", false);
  elements.authStatus.classList.toggle("signed-out", !snapshot.isSignedIn);
  elements.authStatus.innerHTML = snapshot.isSignedIn ? "Ready" : "Sign in";

  if (!snapshot.isSignedIn) {
    settingsInitialized = false;
    return;
  }

  elements.accountEmail.textContent = snapshot.email || snapshot.displayName || "SnapGrok user";

  if (!settingsInitialized) {
    settingsInitialized = true;
    await initializeSettings();
  }
}

function showChecking() {
  elements.authLoading.hidden = false;
  elements.signedInView.hidden = true;
  elements.signedOutView.hidden = true;
  elements.authStatus.classList.add("checking");
  elements.authStatus.classList.remove("signed-out");
  elements.authStatus.innerHTML = "Checking";
}

async function initializeSettings() {
  const [settings, commands] = await Promise.all([
    SnapGrokSettings.getSettings(),
    chrome.commands.getAll(),
  ]);

  const commandMap = new Map(
    commands.map((command) => [command.name, command.shortcut || "Not assigned"]),
  );

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
  elements.instructionPreview.textContent =
    text || "No instruction saved yet. Add the context you want applied to every screenshot.";
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
  elements.authStatus.innerHTML = "Unavailable";
  elements.message.textContent =
    "Account status is still synchronizing. Close and reopen SnapGrok once.";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
