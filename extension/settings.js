(() => {
  "use strict";

  const STORAGE_KEY = "snapgrokSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    version: 38,
    instruction: "",
  });

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      version: 38,
      instruction: typeof source.instruction === "string"
        ? source.instruction.slice(0, 12000)
        : "",
    };
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const normalized = normalizeSettings(stored[STORAGE_KEY]);

    if (JSON.stringify(stored[STORAGE_KEY] || {}) !== JSON.stringify(normalized)) {
      await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    }

    return normalized;
  }

  async function saveInstruction(instruction) {
    const normalized = normalizeSettings({ instruction });
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  self.SnapGrokSettings = {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    normalizeSettings,
    getSettings,
    saveInstruction,
  };
})();
