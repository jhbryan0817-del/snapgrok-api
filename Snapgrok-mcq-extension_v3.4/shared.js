(() => {
  const SETTINGS_KEY = "snapgrokV34Settings";
  const DEFAULT_SETTINGS = Object.freeze({
    instruction: "",
  });

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      instruction:
        typeof source.instruction === "string"
          ? source.instruction.slice(0, 12000)
          : "",
    };
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    const settings = normalizeSettings(stored[SETTINGS_KEY]);

    if (JSON.stringify(stored[SETTINGS_KEY] || {}) !== JSON.stringify(settings)) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    }

    return settings;
  }

  async function saveSettings(value) {
    const settings = normalizeSettings(value);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    return settings;
  }

  self.SnapGrokV34 = {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
  };
})();
