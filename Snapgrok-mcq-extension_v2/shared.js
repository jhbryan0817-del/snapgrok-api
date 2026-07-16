(() => {
  const SETTINGS_KEY = "settings";
  const DEFAULT_SETTINGS = Object.freeze({
    version: 3,
    instruction: "",
  });

  function cleanInstruction(value) {
    return typeof value === "string" ? value.trim().slice(0, 12000) : "";
  }

  function normalizeSettings(value) {
    const incoming = value && typeof value === "object" ? value : {};

    // When this version replaces an older build with the same extension ID,
    // retain the first existing instruction rather than discarding it.
    const legacyInstruction = Array.isArray(incoming.slots)
      ? incoming.slots.find((slot) => cleanInstruction(slot?.instruction))?.instruction
      : "";

    return {
      version: DEFAULT_SETTINGS.version,
      instruction: cleanInstruction(incoming.instruction || legacyInstruction),
    };
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    const normalized = normalizeSettings(stored[SETTINGS_KEY]);

    if (JSON.stringify(stored[SETTINGS_KEY] || {}) !== JSON.stringify(normalized)) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: normalized });
    }

    return normalized;
  }

  async function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    await chrome.storage.local.set({ [SETTINGS_KEY]: normalized });
    return normalized;
  }

  async function updateSettings(mutator) {
    const current = await getSettings();
    const updated = (await mutator({ ...current })) || current;
    return saveSettings(updated);
  }

  self.SnapGrok = {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    updateSettings,
  };
})();
