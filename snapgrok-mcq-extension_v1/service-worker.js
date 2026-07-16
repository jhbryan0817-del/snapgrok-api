importScripts("shared.js");

const COMMAND_TO_SLOT = {
  "run-shortcut-1": 0,
  "run-shortcut-2": 1,
  "run-shortcut-3": 2,
};

const ICONS = {
  default: iconPath("default"),
  A: iconPath("answer-a"),
  B: iconPath("answer-b"),
  C: iconPath("answer-c"),
  D: iconPath("answer-d"),
  E: iconPath("answer-e"),
};

const ICON_DISPLAY_MS = 5000;
const MINIMUM_SERVER_WORD_LIMIT = 20;
let resetTimerId = null;

chrome.runtime.onInstalled.addListener(async () => {
  await SnapGrok.getSettings();
  await resetAnswerIcon();
});

chrome.runtime.onStartup.addListener(() => {
  restoreIconState().catch(console.error);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "pause-extension") {
    pauseExtension().catch(handleUnexpectedError);
    return;
  }

  const slotIndex = COMMAND_TO_SLOT[command];
  if (slotIndex !== undefined) {
    processShortcut(slotIndex).catch(handleUnexpectedError);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PAUSE_EXTENSION") {
    pauseExtension()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "RESUME_EXTENSION") {
    resumeExtension()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

restoreIconState().catch(console.error);

function iconPath(baseName) {
  return {
    16: `icons/${baseName}16.png`,
    32: `icons/${baseName}32.png`,
    48: `icons/${baseName}48.png`,
    128: `icons/${baseName}128.png`,
  };
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/default128.png",
      title,
      message,
      priority: 0,
    });
  } catch {
    // Notifications are useful for setup and errors, but not required for the core workflow.
  }
}

async function handleUnexpectedError(error) {
  console.error(error);
  await resetAnswerIcon();
  await notify("SnapGrok MCQ error", error?.message || "Unexpected error.");
}

async function pauseExtension() {
  await SnapGrok.updateSettings((settings) => {
    settings.paused = true;
    return settings;
  });

  await chrome.storage.session.remove(["latestRequestToken", "iconState"]);
  await resetAnswerIcon();
  await notify("SnapGrok MCQ paused", "Open the extension popup and press Resume to use the shortcuts again.");
}

async function resumeExtension() {
  await SnapGrok.updateSettings((settings) => {
    settings.paused = false;
    return settings;
  });

  await resetAnswerIcon();
}

async function processShortcut(slotIndex) {
  const settings = await SnapGrok.getSettings();

  if (settings.paused) {
    await notify("SnapGrok MCQ is paused", "Open the extension popup and press Resume.");
    return;
  }

  const slot = settings.slots[slotIndex];
  if (!slot) throw new Error("Shortcut configuration was not found.");
  if (!slot.instruction.trim()) {
    await notify("Instruction missing", `Add a name and instruction for shortcut ${slotIndex + 1}.`);
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.windowId) throw new Error("No active Chrome tab was found.");

  const requestToken = crypto.randomUUID();
  await chrome.storage.session.set({ latestRequestToken: requestToken });
  await resetAnswerIcon({ preserveRequestToken: true });
  await chrome.action.setTitle({ title: "SnapGrok is analyzing the visible tab…" });

  try {
    const imageDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
      format: "jpeg",
      quality: 88,
    });

    const strictInstruction = buildStrictInstruction(slot.instruction);
    const response = await fetch(`${settings.serverUrl.replace(/\/$/, "")}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        shortcutName: slot.name || `MCQ shortcut ${slotIndex + 1}`,
        instruction: strictInstruction,
        maxWords: MINIMUM_SERVER_WORD_LIMIT,
        deleteAfterUse: true,
        sourceUrl: activeTab.url || null,
        sourceTitle: activeTab.title || null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Backend returned HTTP ${response.status}.`);
    }

    if (!(await isLatestRequest(requestToken))) return;

    const choice = parseChoice(payload.text);
    if (!choice) {
      const received = String(payload.text || "empty response").trim().slice(0, 120);
      throw new Error(`Grok did not return one recognizable A-E answer. Received: ${received}`);
    }

    await showAnswerIcon(choice);
  } catch (error) {
    if (!(await isLatestRequest(requestToken))) return;
    await resetAnswerIcon({ preserveRequestToken: true });
    await notify("SnapGrok MCQ error", error?.message || "Unexpected error.");
  }
}

async function isLatestRequest(requestToken) {
  const latest = await chrome.storage.session.get("latestRequestToken");
  return latest.latestRequestToken === requestToken;
}

function buildStrictInstruction(userInstruction) {
  return [
    userInstruction.trim(),
    "The screenshot contains a multiple-choice problem. Determine the single best answer from choices A, B, C, D, or E.",
    "FINAL OUTPUT RULE: Return exactly one uppercase character: A, B, C, D, or E. Do not include words, explanation, punctuation, markdown, or extra whitespace.",
  ].join("\n\n");
}

function parseChoice(value) {
  const text = String(value || "")
    .toUpperCase()
    .replace(/[`*_#]/g, "")
    .trim();

  const singleChoice = text.match(/^\(?\s*([A-E])\s*\)?[.!]?$/);
  if (singleChoice) return singleChoice[1];

  const labelled = text.match(/(?:ANSWER|CHOICE|OPTION|FINAL)\s*(?:ANSWER\s*)?(?:IS|:|=|-)??\s*\(?([A-E])\)?[.!]?\s*$/);
  return labelled ? labelled[1] : null;
}

async function showAnswerIcon(choice) {
  const token = crypto.randomUUID();
  const resetAt = Date.now() + ICON_DISPLAY_MS;

  if (resetTimerId !== null) clearTimeout(resetTimerId);

  await chrome.action.setIcon({ path: ICONS[choice] });
  await chrome.action.setTitle({ title: `MCQ answer: ${choice} · resets in 5 seconds` });
  await chrome.storage.session.set({ iconState: { choice, token, resetAt } });

  resetTimerId = setTimeout(() => {
    resetIconIfCurrent(token).catch(console.error);
  }, ICON_DISPLAY_MS);
}

async function restoreIconState() {
  const { iconState } = await chrome.storage.session.get("iconState");

  if (!iconState?.choice || !ICONS[iconState.choice] || iconState.resetAt <= Date.now()) {
    await resetAnswerIcon({ preserveRequestToken: true });
    return;
  }

  await chrome.action.setIcon({ path: ICONS[iconState.choice] });
  await chrome.action.setTitle({ title: `MCQ answer: ${iconState.choice} · resets in 5 seconds` });

  if (resetTimerId !== null) clearTimeout(resetTimerId);
  resetTimerId = setTimeout(() => {
    resetIconIfCurrent(iconState.token).catch(console.error);
  }, Math.max(iconState.resetAt - Date.now(), 0));
}

async function resetIconIfCurrent(token) {
  const { iconState } = await chrome.storage.session.get("iconState");
  if (iconState?.token !== token) return;
  await resetAnswerIcon({ preserveRequestToken: true });
}

async function resetAnswerIcon({ preserveRequestToken = false } = {}) {
  if (resetTimerId !== null) {
    clearTimeout(resetTimerId);
    resetTimerId = null;
  }

  await chrome.action.setIcon({ path: ICONS.default });
  await chrome.action.setTitle({ title: "Open SnapGrok MCQ settings" });
  await chrome.storage.session.remove("iconState");

  if (!preserveRequestToken) {
    await chrome.storage.session.remove("latestRequestToken");
  }
}
