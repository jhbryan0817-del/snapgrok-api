(() => {
  "use strict";

  // Saved context is used only by trusted extension pages and the service
  // worker. Keep it unavailable to scripts injected into arbitrary tabs.
  if (typeof chrome.storage.local.setAccessLevel === "function") {
    void chrome.storage.local
      .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
      .catch(() => {
        // Do not interrupt settings if an enterprise policy blocks this
        // defense-in-depth restriction.
      });
  }

  const STORAGE_KEY = "snapgrokSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    version: 39,
    instruction: "",
  });

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      version: 39,
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
