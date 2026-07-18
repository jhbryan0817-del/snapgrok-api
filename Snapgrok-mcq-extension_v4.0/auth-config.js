(() => {
  "use strict";

  // Change this after deploying the website, for example:
  // const PRODUCTION_SITE_URL = "https://snapgrok.com";
  const PRODUCTION_SITE_URL = "";
  const DEVELOPMENT_SITE_URL = "http://localhost:3000";

  const normalizedProductionUrl = PRODUCTION_SITE_URL.trim().replace(/\/$/, "");
  const siteUrl = normalizedProductionUrl || DEVELOPMENT_SITE_URL;

  self.SnapGrokAuthConfig = Object.freeze({
    mode: "placeholder",
    siteUrl,
    signInUrl: `${siteUrl}/extension-login`,
    signUpUrl: `${siteUrl}/sign-up?source=extension`,
    dashboardUrl: `${siteUrl}/dashboard?source=extension`,
  });
})();
