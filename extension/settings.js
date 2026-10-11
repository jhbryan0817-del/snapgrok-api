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
  const CAPTURE_CONSENT_KEY = "zenaianCaptureConsent";
  const CAPTURE_DISCLOSURE_VERSION = 1;
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

  async function hasCaptureConsent() {
    const stored = await chrome.storage.local.get(CAPTURE_CONSENT_KEY);
    const consent = stored[CAPTURE_CONSENT_KEY];
    return consent?.accepted === true &&
      consent.disclosureVersion === CAPTURE_DISCLOSURE_VERSION;
  }

  async function setCaptureConsent(accepted) {
    if (accepted !== true) {
      await chrome.storage.local.remove(CAPTURE_CONSENT_KEY);
      return;
    }
    await chrome.storage.local.set({
      [CAPTURE_CONSENT_KEY]: {
        accepted: true,
        disclosureVersion: CAPTURE_DISCLOSURE_VERSION,
        acceptedAt: new Date().toISOString(),
      },
    });
  }

  self.SnapGrokSettings = {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    normalizeSettings,
    getSettings,
    saveInstruction,
    hasCaptureConsent,
    setCaptureConsent,
  };
})();
