(() => {
  "use strict";

  const SESSION_KEY = "sneaksolveDeviceSessionV1";
  const PAIRING_KEY = "sneaksolvePairingNonceV1";
  const PAIRING_TTL_MS = 5 * 60 * 1000;
  const ACCESS_REFRESH_MARGIN_MS = 60 * 1000;
  const SERVER_URL = String(SnapGrokAuthConfig.serverUrl || "").replace(/\/$/, "");
  let refreshPromise = null;

  if (typeof chrome.storage.local.setAccessLevel === "function") {
    void chrome.storage.local
      .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
      .catch(() => undefined);
  }

  async function getAuthSnapshot({ verify = true } = {}) {
    const session = await readSession();
    if (!session) return signedOutSnapshot();

    if (!verify) return signedInSnapshot(session.profile);

    try {
      const response = await fetchWithAuth("/api/extension/session/verify", {
        method: "POST",
        body: "{}",
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload?.ok) {
        throw apiError(response.status, payload);
      }
      const profile = normalizeProfile(payload.profile || session.profile);
      await updateProfile(profile);
      return signedInSnapshot(profile);
    } catch (error) {
      if (isAuthenticationError(error)) {
        await clearSession();
        return signedOutSnapshot();
      }
      throw error;
    }
  }

  async function getAccessToken({ forceRefresh = false } = {}) {
    const session = await readSession();
    if (!session) return "";
    const expiresAt = Date.parse(session.accessExpiresAt);
    if (
      !forceRefresh &&
      Number.isFinite(expiresAt) &&
      expiresAt - ACCESS_REFRESH_MARGIN_MS > Date.now()
    ) {
      return session.accessToken;
    }
    const refreshed = await refreshSession(session);
    return refreshed?.accessToken || "";
  }

  async function refreshSession(existingSession = null) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const session = existingSession || await readSession();
      if (!session?.refreshToken) return null;
      const response = await fetch(`${SERVER_URL}/api/extension/session/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload?.ok) {
        const error = apiError(response.status, payload);
        if (isAuthenticationError(error)) await clearSession();
        throw error;
      }
      const refreshed = normalizeSession({
        ...session,
        accessToken: payload.accessToken,
        accessExpiresAt: payload.accessExpiresAt,
        refreshToken: payload.refreshToken,
        refreshExpiresAt: payload.refreshExpiresAt,
      });
      if (!refreshed) {
        await clearSession();
        throw new Error("Zenaian received an invalid refreshed session.");
      }
      await chrome.storage.local.set({ [SESSION_KEY]: refreshed });
      return refreshed;
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  async function fetchWithAuth(path, init = {}) {
    let token = await getAccessToken();
    if (!token) {
      throw authError(
        "DEVICE_SESSION_REQUIRED",
        "Sign in to Zenaian from the extension popup before capturing a question.",
      );
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${SERVER_URL}${path}`, {
        ...init,
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });
      if (response.status !== 401) return response;
      if (attempt > 0) {
        await clearSession();
        return response;
      }
      token = await getAccessToken({ forceRefresh: true });
      if (!token) return response;
    }
    throw authError(
      "DEVICE_SESSION_REQUIRED",
      "Your Zenaian session is no longer active.",
    );
  }

  async function getOrCreatePairingNonce({ forceNew = false } = {}) {
    const stored = await chrome.storage.session.get(PAIRING_KEY);
    const current = normalizePairing(stored[PAIRING_KEY]);
    if (!forceNew && current && current.expiresAt > Date.now()) {
      return current.nonce;
    }
    const nonce = randomBase64Url(32);
    await chrome.storage.session.set({
      [PAIRING_KEY]: {
        nonce,
        expiresAt: Date.now() + PAIRING_TTL_MS,
      },
    });
    return nonce;
  }

  async function acceptPairing({ pairingCode, nonce }) {
    const stored = await chrome.storage.session.get(PAIRING_KEY);
    const pairing = normalizePairing(stored[PAIRING_KEY]);
    if (
      !pairing ||
      pairing.expiresAt <= Date.now() ||
      !constantTimeTextEqual(pairing.nonce, nonce)
    ) {
      throw authError(
        "PAIRING_NONCE_MISMATCH",
        "The extension connection request expired. Reopen Zenaian and try again.",
      );
    }
    const response = await fetch(`${SERVER_URL}/api/extension/pairings/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "omit",
      body: JSON.stringify({ pairingCode, nonce }),
    });
    const payload = await readPayload(response);
    if (!response.ok || !payload?.ok) {
      throw apiError(response.status, payload);
    }
    const session = normalizeSession({
      accessToken: payload.accessToken,
      accessExpiresAt: payload.accessExpiresAt,
      refreshToken: payload.refreshToken,
      refreshExpiresAt: payload.refreshExpiresAt,
      profile: payload.profile,
    });
    if (!session) {
      throw new Error("Zenaian received an invalid extension session.");
    }
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    await chrome.storage.session.remove(PAIRING_KEY);
    return signedInSnapshot(session.profile);
  }

  async function clearSession() {
    await chrome.storage.local.remove(SESSION_KEY);
    await chrome.storage.session.remove(PAIRING_KEY);
  }

  async function revokeAndClear() {
    try {
      const response = await fetchWithAuth("/api/extension/session/revoke", {
        method: "POST",
        body: "{}",
      });
      await response.arrayBuffer().catch(() => undefined);
    } catch {}
    await clearSession();
  }

  function isTrustedInternalSender(sender) {
    if (sender?.id !== chrome.runtime.id) return false;

    const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
    const senderOrigin = String(sender?.origin || "");
    if (senderOrigin) return senderOrigin === extensionOrigin;

    const senderUrl = String(sender?.url || "");
    if (senderUrl) {
      return senderUrl === extensionOrigin || senderUrl.startsWith(`${extensionOrigin}/`);
    }

    // Chrome documents both MessageSender.origin and MessageSender.url as
    // optional. An extension popup has no tab, while a content script does.
    return !sender?.tab;
  }

  async function hasStoredSession() {
    return Boolean(await readSession());
  }

  async function readSession() {
    const stored = await chrome.storage.local.get(SESSION_KEY);
    const session = normalizeSession(stored[SESSION_KEY]);
    if (!session && stored[SESSION_KEY] !== undefined) {
      await chrome.storage.local.remove(SESSION_KEY);
    }
    return session;
  }

  async function updateProfile(profile) {
    const session = await readSession();
    if (!session) return;
    await chrome.storage.local.set({
      [SESSION_KEY]: { ...session, profile: normalizeProfile(profile) },
    });
  }

  function normalizeSession(value) {
    if (!value || typeof value !== "object") return null;
    const session = {
      version: 1,
      accessToken: String(value.accessToken || ""),
      accessExpiresAt: String(value.accessExpiresAt || ""),
      refreshToken: String(value.refreshToken || ""),
      refreshExpiresAt: String(value.refreshExpiresAt || ""),
      profile: normalizeProfile(value.profile),
    };
    if (
      !/^ssv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.accessToken) ||
      !/^ssv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.refreshToken) ||
      !Number.isFinite(Date.parse(session.accessExpiresAt)) ||
      !Number.isFinite(Date.parse(session.refreshExpiresAt)) ||
      Date.parse(session.refreshExpiresAt) <= Date.now() ||
      !session.profile.accountId
    ) {
      return null;
    }
    return session;
  }

  function normalizeProfile(value) {
    const accountId = /^user_[A-Za-z0-9]{5,100}$/.test(
      String(value?.accountId || ""),
    )
      ? String(value.accountId)
      : "";
    const email = String(value?.email || "").trim().slice(0, 254);
    const displayName = String(value?.displayName || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return {
      accountId,
      email,
      displayName: displayName || email || "Zenaian user",
    };
  }

  function normalizePairing(value) {
    if (
      !value ||
      typeof value !== "object" ||
      !/^[A-Za-z0-9_-]{43}$/.test(String(value.nonce || "")) ||
      !Number.isFinite(Number(value.expiresAt))
    ) {
      return null;
    }
    return { nonce: value.nonce, expiresAt: Number(value.expiresAt) };
  }

  function signedInSnapshot(profile) {
    const normalized = normalizeProfile(profile);
    return {
      isSignedIn: true,
      deviceSessionPresent: true,
      accountId: normalized.accountId,
      email: normalized.email,
      displayName: normalized.displayName,
    };
  }

  function signedOutSnapshot() {
    return {
      isSignedIn: false,
      deviceSessionPresent: false,
      accountId: "",
      email: "",
      displayName: "",
    };
  }

  async function readPayload(response) {
    return response.json().catch(() => ({}));
  }

  function apiError(status, payload) {
    const code = /^[A-Z][A-Z0-9_]{0,63}$/.test(String(payload?.code || ""))
      ? payload.code
      : "REQUEST_FAILED";
    const message =
      status < 500 && typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim().slice(0, 240)
        : "The Zenaian service is temporarily unavailable.";
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.payload = payload;
    return error;
  }

  function authError(code, message) {
    const error = new Error(message);
    error.status = 401;
    error.code = code;
    return error;
  }

  function isAuthenticationError(error) {
    return Number(error?.status) === 401 || [
      "DEVICE_SESSION_REQUIRED",
      "DEVICE_SESSION_INACTIVE",
      "DEVICE_TOKEN_INVALID",
      "DEVICE_TOKEN_ORIGIN_INVALID",
      "DEVICE_ACCESS_EXPIRED",
      "DEVICE_REFRESH_EXPIRED",
      "DEVICE_REFRESH_REUSED",
    ].includes(String(error?.code || ""));
  }

  function randomBase64Url(byteLength) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function constantTimeTextEqual(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    let difference = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
    }
    return difference === 0;
  }

  self.SnapGrokAuth = Object.freeze({
    SESSION_KEY,
    acceptPairing,
    clearSession,
    fetchWithAuth,
    getAccessToken,
    getAuthSnapshot,
    getOrCreatePairingNonce,
    hasStoredSession,
    isAuthenticationError,
    isTrustedInternalSender,
    revokeAndClear,
  });
})();
