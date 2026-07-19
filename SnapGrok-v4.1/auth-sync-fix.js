(() => {
  "use strict";

  const baseAuth = globalThis.SnapGrokAuth;
  const config = globalThis.SnapGrokAuthConfig;

  if (!baseAuth?.getAuthSnapshot || !baseAuth?.getSessionToken || !config) {
    console.error("[SnapGrok Auth Sync] Clerk authentication loaded in an unexpected order.");
    return;
  }

  const STATE_KEY = "snapgrokAuthStateV403";
  const RELOAD_KEY = "snapgrokAuthReloadV403";
  const RELOAD_GUARD_MS = 3500;
  const COOKIE_DEBOUNCE_MS = 450;
  const MAIN_COOKIE_NAMES = new Set(["__clerk_db_jwt", "__client"]);
  const RELEVANT_COOKIE_NAMES = new Set([
    "__clerk_db_jwt",
    "__client",
    "__clerk_uat",
    "__session",
  ]);

  const origins = [...new Set([
    normalizeOrigin(config.syncHost),
    normalizeOrigin(config.frontendApiUrl),
    normalizeOrigin(config.websiteUrl),
  ].filter(Boolean))];

  const hostnames = origins.map((origin) => new URL(origin).hostname.toLowerCase());
  let cookieChangeTimer = null;
  let reconciliationPromise = null;

  // Registered synchronously at service-worker startup so Chrome can wake the
  // dormant MV3 worker when Clerk's synchronization cookies change.
  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!isRelevantCookie(changeInfo?.cookie)) return;

    if (cookieChangeTimer !== null) clearTimeout(cookieChangeTimer);
    cookieChangeTimer = setTimeout(() => {
      cookieChangeTimer = null;
      void reconcileAuthState("cookie-change", true);
    }, COOKIE_DEBOUNCE_MS);
  });

  void reconcileAuthState("worker-start", false);

  globalThis.SnapGrokAuth = Object.freeze({
    getAuthSnapshot: getFreshAuthSnapshot,
    getSessionToken: getFreshSessionToken,
  });

  async function getFreshAuthSnapshot() {
    const cookieState = await readCookieState();
    let snapshot = normalizeSnapshot(await baseAuth.getAuthSnapshot());

    if (!hasCookieMismatch(snapshot, cookieState)) {
      await rememberState(snapshot, cookieState, "auth-request");
      return snapshot;
    }

    // Give Clerk's own cookie listener time to consume a just-updated client
    // cookie before rebuilding the background context.
    for (const waitMs of [120, 250, 500]) {
      await baseAuth.getSessionToken().catch(() => null);
      await delay(waitMs);
      snapshot = normalizeSnapshot(await baseAuth.getAuthSnapshot());
      if (!hasCookieMismatch(snapshot, cookieState)) {
        await rememberState(snapshot, cookieState, "auth-request-recovered");
        return snapshot;
      }
    }

    await rememberState(snapshot, cookieState, "auth-request-mismatch");
    await requestSafeReload("snapshot-cookie-mismatch");

    // Never display or use a stale signed-in session after a confirmed sign-out.
    if (cookieState.signedInHint === false) return signedOutSnapshot();
    throw new Error("AUTH_STATE_REFRESHING");
  }

  async function getFreshSessionToken() {
    const cookieState = await readCookieState();
    let token = await baseAuth.getSessionToken();

    if (cookieState.signedInHint === false) {
      await rememberState(signedOutSnapshot(), cookieState, "token-request-signed-out");
      if (token) await requestSafeReload("stale-token-after-sign-out");
      return null;
    }

    if (token || cookieState.signedInHint !== true) return token || null;

    for (const waitMs of [120, 250, 500]) {
      await delay(waitMs);
      token = await baseAuth.getSessionToken();
      if (token) return token;
    }

    await requestSafeReload("missing-token-after-sign-in");
    return null;
  }

  async function reconcileAuthState(reason, reloadOnMismatch) {
    if (reconciliationPromise) return reconciliationPromise;

    reconciliationPromise = (async () => {
      const cookieState = await readCookieState();
      let snapshot;

      try {
        snapshot = normalizeSnapshot(await baseAuth.getAuthSnapshot());
      } catch (error) {
        console.debug("[SnapGrok Auth Sync] Snapshot reconciliation delayed", error?.message || error);
        if (reloadOnMismatch && cookieState.signedInHint !== null) {
          await requestSafeReload("snapshot-reconciliation-error");
        }
        return;
      }

      const stored = await chrome.storage.local.get(STATE_KEY);
      const previous = stored[STATE_KEY];
      const mismatch = hasCookieMismatch(snapshot, cookieState);
      const changed =
        previous?.isSignedIn !== snapshot.isSignedIn ||
        previous?.userId !== snapshot.userId ||
        previous?.signedInHint !== cookieState.signedInHint;

      await rememberState(snapshot, cookieState, reason);

      if (changed || mismatch) {
        chrome.runtime
          .sendMessage({
            type: "SNAPGROK_AUTH_STATE_CHANGED",
            snapshot: mismatch && cookieState.signedInHint === false
              ? signedOutSnapshot()
              : snapshot,
          })
          .catch(() => {});
      }

      if (mismatch && reloadOnMismatch) {
        await requestSafeReload(
          `cookie-hint-${cookieState.signedInHint}-client-${snapshot.isSignedIn}`,
        );
      }
    })().finally(() => {
      reconciliationPromise = null;
    });

    return reconciliationPromise;
  }

  async function readCookieState() {
    const records = [];

    for (const origin of origins) {
      try {
        const cookies = await chrome.cookies.getAll({ url: `${origin}/` });
        for (const cookie of cookies) records.push({ origin, cookie });
      } catch (error) {
        console.debug("[SnapGrok Auth Sync] Cookie read skipped", origin, error?.message || error);
      }
    }

    const unique = new Map();
    for (const record of records) {
      const { cookie } = record;
      const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
      if (!unique.has(key)) unique.set(key, record);
    }

    const values = [...unique.values()].map((record) => record.cookie);
    const uatCookie = values.find((cookie) => cookie.name === "__clerk_uat");
    const sessionCookie = values.find(
      (cookie) => cookie.name === "__session" && Boolean(cookie.value),
    );
    const mainCookie = values.find(
      (cookie) => MAIN_COOKIE_NAMES.has(cookie.name) && Boolean(cookie.value),
    );

    let signedInHint = null;
    if (uatCookie) {
      signedInHint = Boolean(uatCookie.value) && uatCookie.value !== "0";
    } else if (sessionCookie) {
      signedInHint = true;
    } else if (!mainCookie) {
      signedInHint = false;
    }

    return {
      signedInHint,
      hasMainCookie: Boolean(mainCookie),
      hasSessionCookie: Boolean(sessionCookie),
      uatValue: uatCookie?.value ?? null,
    };
  }

  function hasCookieMismatch(snapshot, cookieState) {
    return (
      typeof cookieState.signedInHint === "boolean" &&
      Boolean(snapshot?.isSignedIn) !== cookieState.signedInHint
    );
  }

  function isRelevantCookie(cookie) {
    if (!cookie || !RELEVANT_COOKIE_NAMES.has(cookie.name)) return false;
    const domain = String(cookie.domain || "").replace(/^\./, "").toLowerCase();
    return hostnames.some(
      (hostname) => hostname === domain || hostname.endsWith(`.${domain}`) || domain.endsWith(`.${hostname}`),
    );
  }

  async function rememberState(snapshot, cookieState, reason) {
    await chrome.storage.local.set({
      [STATE_KEY]: {
        isSignedIn: Boolean(snapshot?.isSignedIn),
        userId: snapshot?.userId || null,
        signedInHint: cookieState.signedInHint,
        checkedAt: Date.now(),
        reason,
      },
    });
  }

  async function requestSafeReload(reason) {
    const now = Date.now();
    const stored = await chrome.storage.local.get(RELOAD_KEY);
    const previous = stored[RELOAD_KEY];

    if (previous?.requestedAt && now - previous.requestedAt < RELOAD_GUARD_MS) return false;

    await chrome.storage.local.set({
      [RELOAD_KEY]: {
        requestedAt: now,
        reason,
      },
    });

    setTimeout(() => chrome.runtime.reload(), 100);
    return true;
  }

  function normalizeSnapshot(snapshot) {
    const email = typeof snapshot?.email === "string" ? snapshot.email : "";
    const displayName =
      typeof snapshot?.displayName === "string" && snapshot.displayName
        ? snapshot.displayName
        : email || "SnapGrok user";

    return {
      isSignedIn: Boolean(snapshot?.isSignedIn),
      userId: snapshot?.userId || null,
      email,
      displayName,
    };
  }

  function signedOutSnapshot() {
    return {
      isSignedIn: false,
      userId: null,
      email: "",
      displayName: "SnapGrok user",
    };
  }

  function normalizeOrigin(value) {
    try {
      return new URL(String(value || "")).origin;
    } catch {
      return null;
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
})();
