(() => {
  const DEFAULT_SETTINGS = {
    version: 2,
    serverUrl: "https://snapgrok-api.onrender.com",
    paused: false,
    slots: [
      { name: "", instruction: "" },
      { name: "", instruction: "" },
      { name: "", instruction: "" },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanText(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }

  function normalizeSettings(value) {
    const incoming = value && typeof value === "object" ? value : {};
    const normalized = clone(DEFAULT_SETTINGS);

    normalized.serverUrl = cleanText(incoming.serverUrl, normalized.serverUrl).trim() || normalized.serverUrl;
    normalized.paused = typeof incoming.paused === "boolean" ? incoming.paused : false;

    if (Array.isArray(incoming.slots)) {
      normalized.slots = normalized.slots.map((slot, index) => {
        const supplied = incoming.slots[index] || {};
        return {
          name: cleanText(supplied.name).slice(0, 80),
          instruction: cleanText(supplied.instruction).slice(0, 12000),
        };
      });
    }

    return normalized;
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get("settings");
    const normalized = normalizeSettings(stored.settings);

    if (JSON.stringify(stored.settings || {}) !== JSON.stringify(normalized)) {
      await chrome.storage.local.set({ settings: normalized });
    }

    return normalized;
  }

  async function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    await chrome.storage.local.set({ settings: normalized });
    return normalized;
  }

  async function updateSettings(mutator) {
    const settings = await getSettings();
    const updated = (await mutator(settings)) || settings;
    return saveSettings(updated);
  }

  function queryParameter(name) {
    return new URLSearchParams(location.search).get(name);
  }

  self.SnapGrok = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    getSettings,
    saveSettings,
    updateSettings,
    queryParameter,
  };
})();
