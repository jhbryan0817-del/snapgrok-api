(() => {
  "use strict";

  /**
   * Stage-1 authentication adapter.
   *
   * This file intentionally does not claim that a user is authenticated.
   * Replace its internals with Clerk later while keeping the popup UI intact.
   * Backend access must never be authorized from this display state alone.
   */

  function getConfig() {
    if (!self.SnapGrokAuthConfig) {
      throw new Error("SnapGrok authentication configuration is missing.");
    }
    return self.SnapGrokAuthConfig;
  }

  async function getState() {
    return {
      configured: false,
      signedIn: false,
      email: "",
      displayName: "",
      message: "Connect Clerk to activate secure account sessions.",
    };
  }

  async function openWebsitePopup(url) {
    await chrome.windows.create({
      url,
      type: "popup",
      width: 500,
      height: 760,
      focused: true,
    });
  }

  async function openSignIn() {
    await openWebsitePopup(getConfig().signInUrl);
  }

  async function openSignUp() {
    await openWebsitePopup(getConfig().signUpUrl);
  }

  async function openDashboard() {
    await chrome.tabs.create({ url: getConfig().dashboardUrl });
  }

  async function signOut() {
    throw new Error("Sign out will be enabled after Clerk is connected.");
  }

  self.SnapGrokAuthBridge = {
    getState,
    openSignIn,
    openSignUp,
    openDashboard,
    signOut,
  };
})();
